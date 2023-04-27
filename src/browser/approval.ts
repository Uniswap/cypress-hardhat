import { JsonRpcProvider } from '@ethersproject/providers'
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'
import { BigNumber } from 'ethers/lib/ethers'

import { AllowanceTransfer__factory, Erc20__factory, Permit2__factory } from '../types'
import { ImpersonatedSigner } from './signer'
import { AddressLike } from './types'

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

export class ApprovalUtils {
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
