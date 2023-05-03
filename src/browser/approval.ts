import { JsonRpcProvider } from '@ethersproject/providers'
import { MaxUint160, MaxUint256, PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'
import { BigNumber, BigNumberish } from 'ethers/lib/ethers'

import { AllowanceTransfer__factory, Erc20__factory, Permit2__factory } from '../types'
import { ImpersonatedSigner } from './signer'
import { AddressLike } from './types'

function get30DayExpiration(): number {
  return Math.floor(Date.now() / 1000) + 2_592_000
}

type ApprovalAddresses = { owner: AddressLike; token: AddressLike; spender: AddressLike }
type Permit2ApprovalAddresses = { owner: AddressLike; token: AddressLike; spender?: AddressLike }

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

export class ApprovalUtils {
  constructor(readonly provider: JsonRpcProvider) {}

  /** Returns the address of the Universal Router for the current chain */
  get universalRouterAddress() {
    return UNIVERSAL_ROUTER_ADDRESS(this.provider.network.chainId)
  }

  /** Returns the amount the spender is allowed by the owner to spend for the token. */
  async getTokenAllowance(addresses: ApprovalAddresses): Promise<BigNumber> {
    const { owner, token, spender } = normalizeApprovalAddresses(addresses)

    const erc20 = Erc20__factory.connect(token, this.provider)
    return await erc20.allowance(owner, spender)
  }

  /**
   * Sets the amount the spender is allowed by the owner to spend for the token.
   *
   * @param amount - number to set the allowance to (defaults to a max token approval of MaxUint256)
   * */
  async setTokenAllowance(addresses: ApprovalAddresses, amount: BigNumberish = MaxUint256): Promise<void> {
    const { owner, token, spender } = normalizeApprovalAddresses(addresses)

    const erc20 = Erc20__factory.connect(token, new ImpersonatedSigner(owner, this.provider))
    await erc20.approve(spender, amount)
  }

  /** Sets the amount the spender is allowed by the owner to spend for the token to 0. */
  async revokeTokenAllowance(addresses: ApprovalAddresses): Promise<void> {
    return this.setTokenAllowance(addresses, 0)
  }

  /** Returns the amount Permit2 is allowed by the owner to spend for the token. */
  async getTokenAllowanceForPermit2(addresses: Omit<ApprovalAddresses, 'spender'>): Promise<BigNumber> {
    return await this.getTokenAllowance({ ...addresses, spender: PERMIT2_ADDRESS })
  }

  /**
   * Sets the amount Permit2 is allowed by the owner to spend for the token.
   *
   * @param amount - number to set the allowance to (defaults to a max token approval of MaxUint256)
   * */
  async setTokenAllowanceForPermit2(addresses: Omit<ApprovalAddresses, 'spender'>, amount: BigNumberish = MaxUint256) {
    return this.setTokenAllowance({ ...addresses, spender: PERMIT2_ADDRESS }, amount)
  }

  /** Sets the amount Permit2 is allowed by the owner to spend for the token to 0. */
  async revokeTokenAllowanceForPermit2(addresses: Omit<ApprovalAddresses, 'spender'>) {
    return this.setTokenAllowanceForPermit2(addresses, 0)
  }

  /** Returns a spender's Permit2 allowance by the owner for the token. Spender is Universal Router by default. */
  async getPermit2Allowance({
    owner,
    token,
    spender = this.universalRouterAddress,
  }: Permit2ApprovalAddresses): Promise<{ amount: BigNumber; expiration: number }> {
    const addresses = normalizeApprovalAddresses({ owner, token, spender })

    const permit2 = Permit2__factory.connect(PERMIT2_ADDRESS, this.provider)
    return permit2.allowance(addresses.owner, addresses.token, addresses.spender)
  }

  /**
   * Sets a spender's Permit2 allowance by the owner for the token.
   *
   * @param addresses - object containing the `owner`, `token`, and `spender` (`spender` defaults to the Universal Router)
   * @param allowance - object containing the `amount` (defaults to a max permit approval of MaxUint160) and `expiration` (defaults to 30 days from the current time)
   * */
  async setPermit2Allowance(
    { owner, token, spender = this.universalRouterAddress }: Permit2ApprovalAddresses,
    { amount = MaxUint160, expiration = get30DayExpiration() } = {} as { amount?: BigNumberish; expiration?: number }
  ): Promise<void> {
    const addresses = normalizeApprovalAddresses({ owner, token, spender })

    const permit2 = AllowanceTransfer__factory.connect(
      PERMIT2_ADDRESS,
      new ImpersonatedSigner(addresses.owner, this.provider)
    )
    await permit2.approve(addresses.token, addresses.spender, amount, expiration)
    return
  }

  /** Sets a spender's Permit2 allowance by the owner for the token to 0. Spender is Universal Router by default. */
  async revokePermit2Allowance(addresses: Permit2ApprovalAddresses): Promise<void> {
    return this.setPermit2Allowance(addresses, { amount: 0, expiration: 0 })
  }
}
