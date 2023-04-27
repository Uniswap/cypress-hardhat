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

type ApprovalAddresses = {
  owner: AddressLike
  token: AddressLike
  spender: AddressLike
}

type Permit2ApprovalAddresses = Omit<ApprovalAddresses, 'spender'>

function normalizeAddressLike(address: AddressLike): string {
  return typeof address === 'string' ? address : address.address
}

function normalizeApprovalAddresses({ owner, token, spender }: ApprovalAddresses) {
  return {
    owner: normalizeAddressLike(owner),
    token: normalizeAddressLike(token),
    spender: normalizeAddressLike(spender),
  }
}

class ApprovalUtils {
  constructor(readonly provider: JsonRpcProvider) {}

  get universalRouterAddress() {
    return UNIVERSAL_ROUTER_ADDRESS(this.provider.network.chainId)
  }

  /** Returns the amount an address is approved to spend for the input token */
  async getTokenAllowance(addresses: ApprovalAddresses): Promise<BigNumber> {
    const { owner, token, spender } = normalizeApprovalAddresses(addresses)

    const erc20 = Erc20__factory.connect(token, this.provider)
    return await erc20.allowance(owner, spender)
  }

  /** Sets the amount an address is approved to spend for the input token */
  async setTokenApproval(addresses: ApprovalAddresses, amount: number): Promise<void> {
    const { owner, token, spender } = normalizeApprovalAddresses(addresses)

    const erc20 = Erc20__factory.connect(token, new ImpersonatedSigner(owner, this.provider))
    await erc20.approve(spender, amount)
    return
  }

  /** Revokes an address's approval to spend the input token */
  async revokeTokenApproval(addresses: ApprovalAddresses): Promise<void> {
    return this.setTokenApproval(addresses, 0)
  }

  /** Returns the amount Permit2 is approved to spend for the input token */
  async getTokenAllowanceForPermit2(addresses: Permit2ApprovalAddresses): Promise<BigNumber> {
    return await this.getTokenAllowance({ ...addresses, spender: PERMIT2_ADDRESS })
  }

  /** Sets the amount Permit2 is approved to spend for the input token */
  async setTokenApprovalForPermit2(addresses: Permit2ApprovalAddresses, amount: number) {
    return this.setTokenApproval({ ...addresses, spender: PERMIT2_ADDRESS }, amount)
  }

  /** Revokes Permit2's approval to spend the input token */
  async revokeTokenApprovalForPermit2(addresses: Permit2ApprovalAddresses) {
    return this.setTokenApprovalForPermit2(addresses, 0)
  }

  /** Returns the amount and expiration of the Universal Router's permit2 approval for the input token */
  async getPermit2Allowance(
    { owner, token }: Permit2ApprovalAddresses,
    router: AddressLike = this.universalRouterAddress
  ): Promise<{ amount: BigNumber; expiration: number }> {
    const addresses = normalizeApprovalAddresses({ owner, token, spender: router })

    const permit2 = Permit2__factory.connect(PERMIT2_ADDRESS, this.provider)
    return permit2.allowance(addresses.owner, addresses.token, addresses.spender)
  }

  /** Sets the amount the Universal Router is permitted to spend for the input token */
  async setPermit2Approval(
    { owner, token }: Permit2ApprovalAddresses,
    amount: number,
    expiration: number,
    router: AddressLike = this.universalRouterAddress
  ): Promise<void> {
    const addresses = normalizeApprovalAddresses({ owner, token, spender: router })

    const permit2 = AllowanceTransfer__factory.connect(
      PERMIT2_ADDRESS,
      new ImpersonatedSigner(addresses.owner, this.provider)
    )
    await permit2.approve(addresses.token, addresses.spender, amount, expiration)
    return
  }

  /** Revokes the Universal Router's permit2 allowance to spend the input token */
  async revokePermit2Approval(
    { owner, token }: Permit2ApprovalAddresses,
    router: AddressLike = this.universalRouterAddress
  ): Promise<void> {
    return this.setPermit2Approval({ owner, token }, 0, 0, router)
  }
}
