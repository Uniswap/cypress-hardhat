import { JsonRpcProvider } from '@ethersproject/providers'
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'
import { BigNumber } from 'ethers/lib/ethers'

import { AllowanceTransfer__factory, Erc20__factory, Permit2__factory } from '../types'
import { ImpersonatedSigner } from './signer'
import { AddressLike } from './types'

type ApprovalAddresses = { owner: AddressLike; token: AddressLike; spender: AddressLike }
type Permit2ApprovalAddresses = { owner: AddressLike; token: AddressLike; spender?: AddressLike }

type Erc20Allowance = BigNumber
type Permit2Allowance = { amount: BigNumber; expiration: number }

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

  get universalRouterAddress() {
    return UNIVERSAL_ROUTER_ADDRESS(this.provider.network.chainId)
  }

  /** Returns the amount an address is approved to spend for the input token. */
  async getTokenAllowance(addresses: ApprovalAddresses): Promise<Erc20Allowance> {
    const { owner, token, spender } = normalizeApprovalAddresses(addresses)

    const erc20 = Erc20__factory.connect(token, this.provider)
    return await erc20.allowance(owner, spender)
  }

  /** Sets the amount an address is approved to spend for the input token. */
  async setTokenApproval(addresses: ApprovalAddresses, amount: number): Promise<void> {
    const { owner, token, spender } = normalizeApprovalAddresses(addresses)

    const erc20 = Erc20__factory.connect(token, new ImpersonatedSigner(owner, this.provider))
    await erc20.approve(spender, amount)
    return
  }

  /** Revokes an address's approval to spend the input token. */
  async revokeTokenApproval(addresses: ApprovalAddresses): Promise<void> {
    return this.setTokenApproval(addresses, 0)
  }

  /** Returns the amount Permit2 is approved to spend for the input token. */
  async getTokenAllowanceForPermit2(addresses: Omit<ApprovalAddresses, 'spender'>): Promise<Erc20Allowance> {
    return await this.getTokenAllowance({ ...addresses, spender: PERMIT2_ADDRESS })
  }

  /** Sets the amount Permit2 is approved to spend for the input token. */
  async setTokenApprovalForPermit2(addresses: Omit<ApprovalAddresses, 'spender'>, amount: number) {
    return this.setTokenApproval({ ...addresses, spender: PERMIT2_ADDRESS }, amount)
  }

  /** Revokes Permit2's approval to spend the input token */
  async revokeTokenApprovalForPermit2(addresses: Omit<ApprovalAddresses, 'spender'>) {
    return this.setTokenApprovalForPermit2(addresses, 0)
  }

  /** Returns a spender's permit2 allowance for the input token. Spender is Universal Router by default. */
  async getPermit2Allowance({
    owner,
    token,
    spender = this.universalRouterAddress,
  }: Permit2ApprovalAddresses): Promise<Permit2Allowance> {
    const addresses = normalizeApprovalAddresses({ owner, token, spender })

    const permit2 = Permit2__factory.connect(PERMIT2_ADDRESS, this.provider)
    return permit2.allowance(addresses.owner, addresses.token, addresses.spender)
  }

  /** Sets the amount/expiration for a spender's permit2 approval. Spender is Universal Router by default. */
  async setPermit2Approval(
    { owner, token, spender = this.universalRouterAddress }: Permit2ApprovalAddresses,
    { amount, expiration }: Permit2Allowance
  ): Promise<void> {
    const addresses = normalizeApprovalAddresses({ owner, token, spender })

    const permit2 = AllowanceTransfer__factory.connect(
      PERMIT2_ADDRESS,
      new ImpersonatedSigner(addresses.owner, this.provider)
    )
    await permit2.approve(addresses.token, addresses.spender, amount, expiration)
    return
  }

  /** Revokes a spender's permit2 allowance to spend the input token. Spender is Universal Router by default. */
  async revokePermit2Approval(addresses: Permit2ApprovalAddresses): Promise<void> {
    return this.setPermit2Approval(addresses, { amount: BigNumber.from(0), expiration: 0 })
  }
}
