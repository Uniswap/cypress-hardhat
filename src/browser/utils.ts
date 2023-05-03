import { Signer } from '@ethersproject/abstract-signer'
import { hexValue } from '@ethersproject/bytes'
import { JsonRpcProvider } from '@ethersproject/providers'
import { parseUnits } from '@ethersproject/units'
import { Wallet } from '@ethersproject/wallet'
import { Currency, CurrencyAmount, Ether } from '@uniswap/sdk-core'
import assert from 'assert'

import { Erc20__factory } from '../types'
import { Network } from '../types/Network'
import { ApprovalUtils } from './approval'
import { HardhatProvider } from './provider'
import { ImpersonatedSigner } from './signer'
import { AddressLike, OneOrMany } from './types'
import { WHALES } from './whales'

const CHAIN_ID = 1
const ETH = Ether.onChain(CHAIN_ID)

export class Utils {
  /** Signing providers configured via hardhat's {@link https://hardhat.org/hardhat-network/reference/#accounts}. */
  readonly providers: JsonRpcProvider[]

  /** Utilities for getting/setting ERC-20 and Permit2 approvals. */
  readonly approval: ApprovalUtils

  constructor(public network: Network) {
    this.providers = this.network.accounts.map((account) => {
      const provider = new HardhatProvider(this.network.url, { chainId: 1, name: 'mainnet' })
      const wallet = new Wallet(account, provider)
      return new Proxy(provider, {
        get(target, prop) {
          switch (prop) {
            case 'listAccounts':
              return () => Promise.resolve([account.address])
            case 'getSigner':
              return () => wallet
            default:
              return Reflect.get(target, prop)
          }
        },
      })
    })
    this.approval = new ApprovalUtils(this.provider)
  }

  reset() {
    return (
      cy
        .task('hardhat:reset')
        // Providers will not "rewind" to an older block number, so they must be reset.
        .then(() => Promise.all(this.providers.map((provider) => (provider as HardhatProvider).reset())))
    )
  }

  /** The primary signing provider configured via hardhat - @see {@link providers}. */
  get provider() {
    return this.providers[0]
  }

  /** Wallets configured via hardhat's {@link https://hardhat.org/hardhat-network/reference/#accounts}. */
  get wallets() {
    return this.providers.map((provider) => provider.getSigner() as Signer as Wallet)
  }

  /** The primary wallet configured via hardhat - @see {@link wallets}. */
  get wallet() {
    return this.wallets[0]
  }

  /** Gets the balance of ETH ERC-20's held by the address. */
  getBalance(address: AddressLike, currencies: Currency): Promise<CurrencyAmount<Currency>>
  getBalance(address: AddressLike, currencies: Currency[]): Promise<CurrencyAmount<Currency>>[]
  getBalance(address: AddressLike, currencies: OneOrMany<Currency>): OneOrMany<Promise<CurrencyAmount<Currency>>> {
    if (!Array.isArray(currencies)) return this.getBalance(address, [currencies])[0]
    if (typeof address !== 'string') return this.getBalance(address.address, currencies)

    return currencies.map(async (currency) => {
      const balance = await (() => {
        if (currency.isNative) return this.provider.getBalance(address)
        assert(currency.isToken)

        const token = Erc20__factory.connect(currency.address, this.provider)
        return token.balanceOf(address)
      })()
      return CurrencyAmount.fromRawAmount(currency, balance.toString())
    })
  }

  /** Attempts to fund an account with ETH or ERC-20's. @see {@link fund}. */
  setBalance(address: AddressLike, amounts: OneOrMany<CurrencyAmount<Currency>>, whales?: string[]) {
    return this.fund(address, amounts, whales)
  }

  /**
   * Attempts to fund an account with ETH / ERC-20's.
   * If amount is in ETH, funds the account directly. (NB: Hardhat initially funds test accounts with 1000 ETH.)
   * If amount is an ERC-20, attempts to transfer the amount from a list of known whales.
   * @param address The address of the account to fund.
   * @param amount If in ETH, the amount to set the balance to. If an ERC-20, the amount to transfer.
   * @param whales If set, overrides the list of known whale addresses from which to transfer ERC-20's.
   */
  async fund(address: AddressLike, amounts: OneOrMany<CurrencyAmount<Currency>>, whales = WHALES): Promise<void> {
    if (!Array.isArray(amounts)) return this.fund(address, [amounts], whales)
    if (typeof address !== 'string') return this.fund(address.address, amounts, whales)

    await Promise.all(
      amounts.map(async (amount) => {
        const { currency } = amount
        const balance = parseUnits(amount.toExact(), currency.decimals)

        if (currency.isNative) {
          return this.send('hardhat_setBalance', [address, hexValue(balance)])
        }
        assert(currency.isToken)

        for (let i = 0; i < whales.length; ++i) {
          const whale = whales[i]
          await this.send('hardhat_impersonateAccount', [whale])
          const token = Erc20__factory.connect(currency.address, new ImpersonatedSigner(whale, this.provider))
          try {
            await token.transfer(address, balance)
            return
          } catch (e) {
            // If failure is due to lack of funds, fund and retry this whale.
            const match = (e as Error).message.match(
              /sender doesn't have enough funds to send tx. The max upfront cost is: (\d*)/
            )
            if (match) {
              const funds = CurrencyAmount.fromRawAmount(ETH, match[1])
              this.fund(whale, funds)
              try {
                await token.transfer(address, balance)
                return
              } catch (e) {
                // Silently ignore.
              }
            }
          } finally {
            await this.send('hardhat_stopImpersonatingAccount', [whale])
          }
        }

        // Tried all the whales and couldn't fund. Error out.
        const blockNumber = await this.provider.getBlockNumber()
        throw new Error(
          `Could not fund ${amount.toExact()} ${
            currency.symbol
          } from any whales on block ${blockNumber}. Update your call to fund() to specify additional 'whale' addresses that hold sufficient balance of the token you are trying to fund.`
        )
      })
    )
  }

  async setAutomine(automine: boolean) {
    await this.send('evm_setAutomine', [automine])
  }

  /**
   * Mines block(s), including any valid transactions in the mempool.
   * The duration between blocks can be controlled by passing blockInterval, which is specified in seconds.
   * blockInterval will be applied to all blocks mined, including between the current and the first mined.
   */
  async mine(count = 1, blockInterval = 12) {
    // blockInterval will only apply to blocks after the first, so the next block will need its timestamp explicitly set.
    const { timestamp } = await this.send('eth_getBlockByNumber', ['latest', false])
    await this.send('evm_setNextBlockTimestamp', [hexValue(Number(timestamp) + blockInterval)])
    await this.send('hardhat_mine', [hexValue(count), hexValue(blockInterval)])
  }

  /** Sends a JSON-RPC directly to hardhat. */
  send(method: string, params: any[]) {
    return this.provider.send(method, params)
  }
}
