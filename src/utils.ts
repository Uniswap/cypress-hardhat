import { ExternallyOwnedAccount, VoidSigner } from '@ethersproject/abstract-signer'
import { hexValue } from '@ethersproject/bytes'
import { resolveProperties } from '@ethersproject/properties'
import {
  JsonRpcProvider,
  StaticJsonRpcProvider,
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/providers'
import { parseUnits } from '@ethersproject/units'
import { Wallet } from '@ethersproject/wallet'
import { Currency, CurrencyAmount, Ether } from '@uniswap/sdk-core'
import assert from 'assert'

import { Erc20__factory } from './types'
import { WHALES } from './whales'

type AddressLike = string | { address: string }
type OneOrMany<T> = T | T[]

class ImpersonatedSigner extends VoidSigner {
  override readonly provider!: JsonRpcProvider

  constructor(address: string, provider: JsonRpcProvider) {
    super(address, provider)
  }

  async sendTransaction(transaction: TransactionRequest): Promise<TransactionResponse> {
    const tx = await resolveProperties(transaction)
    tx.from = this.address
    const hexTx = JsonRpcProvider.hexlifyTransaction(tx, { from: true })
    const hash = await this.provider.send('eth_sendTransaction', [hexTx])
    return this.provider.getTransaction(hash)
  }
}

const CHAIN_ID = 1
const ETH = Ether.onChain(CHAIN_ID)

export class HardhatUtils {
  /** The JSON-RPC url to connect to the hardhat network. */
  readonly url: string
  /** The accounts configured via hardhat's {@link https://hardhat.org/hardhat-network/reference/#accounts}. */
  readonly accounts: ExternallyOwnedAccount[]
  /** The signing providers configured via hardhat's {@link https://hardhat.org/hardhat-network/reference/#accounts}. */
  readonly providers: JsonRpcProvider[]

  constructor({ url, accounts }: { url: string; accounts: ExternallyOwnedAccount[] }) {
    this.url = url
    this.accounts = accounts
    this.providers = accounts.map((account) => {
      const provider = new StaticJsonRpcProvider(url, { chainId: 1, name: 'mainnet' })
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
  }

  /** The first account configured via hardhat - @see {@link accounts}. */
  get account() {
    return this.accounts[0]
  }
  /** The first signing provider configured via hardhat - @see {@link providers}. */
  get provider() {
    return this.providers[0]
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

  private send(method: string, params: any[]) {
    return this.provider.send(method, params)
  }
}
