/* eslint-disable import/no-unused-modules */
import { Signer, VoidSigner } from '@ethersproject/abstract-signer'
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
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import { Currency, CurrencyAmount, Ether } from '@uniswap/sdk-core'
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'
import assert from 'assert'
import { BigNumber } from 'ethers/lib/ethers'

import { AllowanceTransfer__factory, Erc20__factory, Permit2__factory } from '../types'
import { Network } from '../types/Network'
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

export class Utils {
  /** Signing providers configured via hardhat's {@link https://hardhat.org/hardhat-network/reference/#accounts}. */
  readonly providers: JsonRpcProvider[]
  approval: ApprovalUtils

  constructor(public network: Network) {
    this.providers = this.network.accounts.map((account) => {
      const provider = new StaticJsonRpcProvider(this.network.url, { chainId: 1, name: 'mainnet' })
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
    return cy.task('hardhat:reset')
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

  private send(method: string, params: any[]) {
    return this.provider.send(method, params)
  }
}

class ApprovalUtils {
  readonly provider: JsonRpcProvider

  constructor(provider: JsonRpcProvider) {
    this.provider = provider
  }

  /** Returns the amount an address is approved to spend for the input token */
  async getErc20Allowance(owner: AddressLike, tokenAddress: AddressLike, spender: AddressLike): Promise<BigNumber> {
    if (typeof owner !== 'string') return this.getErc20Allowance(owner.address, tokenAddress, spender)
    if (typeof tokenAddress !== 'string') return this.getErc20Allowance(owner, tokenAddress.address, spender)
    if (typeof spender !== 'string') return this.getErc20Allowance(owner, tokenAddress, spender.address)

    const token = Erc20__factory.connect(tokenAddress, this.provider)
    return await token.allowance(owner, spender)
  }

  /** Sets the amount an address is approved to spend for the input token */
  async setErc20Approval(
    owner: AddressLike,
    tokenAddress: AddressLike,
    spender: AddressLike,
    amount: number
  ): Promise<void> {
    if (typeof owner !== 'string') return this.setErc20Approval(owner.address, tokenAddress, spender, amount)
    if (typeof tokenAddress !== 'string') return this.setErc20Approval(owner, tokenAddress.address, spender, amount)
    if (typeof spender !== 'string') return this.setErc20Approval(owner, tokenAddress, spender.address, amount)

    const token = Erc20__factory.connect(tokenAddress, new ImpersonatedSigner(owner, this.provider))
    await token.approve(spender, amount)
    return
  }

  /** Revokes an address's approval to spend the input token */
  async revokeErc20Approval(owner: AddressLike, tokenAddress: AddressLike, spender: AddressLike): Promise<void> {
    return this.setErc20Approval(owner, tokenAddress, spender, 0)
  }

  /** Returns the amount Permit2 is approved to spend for the input token */
  async getPermit2Allowance(owner: AddressLike, tokenAddress: AddressLike): Promise<BigNumber> {
    return await this.getErc20Allowance(owner, tokenAddress, PERMIT2_ADDRESS)
  }

  /** Sets the amount Permit2 is approved to spend for the input token */
  async setPermit2Approval(owner: AddressLike, tokenAddress: AddressLike, amount: number) {
    return this.setErc20Approval(owner, tokenAddress, PERMIT2_ADDRESS, amount)
  }

  /** Revokes Permit2's approval to spend the input token */
  async revokePermit2Approval(owner: AddressLike, tokenAddress: AddressLike) {
    return this.setPermit2Approval(owner, tokenAddress, 0)
  }

  /** Returns the amount and expiration of the Universal Router's permit2 approval for the input token */
  async getUniversalRouterAllowance(
    owner: AddressLike,
    tokenAddress: AddressLike
  ): Promise<{ amount: BigNumber; expiration: number }> {
    if (typeof owner !== 'string') return this.getUniversalRouterAllowance(owner.address, tokenAddress)
    if (typeof tokenAddress !== 'string') return this.getUniversalRouterAllowance(owner, tokenAddress.address)

    const permit2 = Permit2__factory.connect(PERMIT2_ADDRESS, this.provider)
    return permit2.allowance(owner, tokenAddress, UNIVERSAL_ROUTER_ADDRESS(this.provider.network.chainId))
  }

  /** Sets the amount the Universal Router is permitted to spend for the input token */
  async permitUniversalRouter(
    owner: AddressLike,
    tokenAddress: AddressLike,
    amount: number,
    expiration: number
  ): Promise<void> {
    if (typeof owner !== 'string') return this.permitUniversalRouter(owner.address, tokenAddress, amount, expiration)
    if (typeof tokenAddress !== 'string')
      return this.permitUniversalRouter(owner, tokenAddress.address, amount, expiration)

    const permit2 = AllowanceTransfer__factory.connect(PERMIT2_ADDRESS, new ImpersonatedSigner(owner, this.provider))
    await permit2.approve(tokenAddress, UNIVERSAL_ROUTER_ADDRESS(this.provider.network.chainId), amount, expiration)
    return
  }

  /** Revokes the Universal Router's permit2 allowance to spend the input token */
  async revokeUniversalRouter(owner: AddressLike, tokenAddress: AddressLike): Promise<void> {
    return this.permitUniversalRouter(owner, tokenAddress, 0, 0)
  }
}
