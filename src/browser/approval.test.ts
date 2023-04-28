/**
 * This test intentionally runs in the jest environment, so it will fail to link hardhat's asm dependency.
 * This is expected, and necessary in order collect coverage.
 */

import { Token } from '@uniswap/sdk-core'
import { BigNumber } from 'ethers/lib/ethers'

import setup from '../plugin/setup'
import { ApprovalUtils } from './approval'
import { AddressLike } from './types'
import { Utils } from './utils'

const CHAIN_ID = 1
const token = new Token(CHAIN_ID, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT')

let env: Awaited<ReturnType<typeof setup>>
let approval: ApprovalUtils
let spender: AddressLike
let owner: AddressLike

beforeAll(async () => {
  env = await setup()
  const utils = new Utils(env)
  approval = utils.approval
  spender = utils.network.accounts[1]
  owner = utils.wallet.address
})
afterAll(() => env.close())

const globalWithCy = global as typeof global & { cy: Cypress.cy }
beforeAll(() => {
  globalWithCy.cy = { task: jest.fn() as Cypress.cy['task'] } as Cypress.cy
})

describe('Approval', () => {
  describe('setTokenAllowance', () => {
    it('approves USDT', async () => {
      const originalAllowance = await approval.getTokenAllowance({ owner, token, spender })
      expect(originalAllowance.toNumber()).toBe(0)

      await approval.setTokenAllowance({ owner, token, spender }, 5)

      const updatedAllowance = await approval.getTokenAllowance({ owner, token, spender })
      expect(updatedAllowance.toNumber()).toBe(5)
    })
    it('revokes USDT', async () => {
      await approval.setTokenAllowance({ owner, token, spender }, 5)
      await approval.revokeTokenAllowance({ owner, token, spender })

      const allowance = await approval.getTokenAllowance({ owner, token, spender })
      expect(allowance.toNumber()).toBe(0)
    })
  })
  describe('setTokenAllowanceForPermit2', () => {
    it('approves USDT for Permit2', async () => {
      const originalAllowance = await approval.getTokenAllowanceForPermit2({ owner, token })
      expect(originalAllowance.toNumber()).toBe(0)

      await approval.setTokenAllowanceForPermit2({ owner, token }, 5)

      const updatedAllowance = await approval.getTokenAllowanceForPermit2({ owner, token })
      expect(updatedAllowance.toNumber()).toBe(5)
    })
    it('revokes USDT for Permit2', async () => {
      await approval.setTokenAllowanceForPermit2({ owner, token }, 5)
      await approval.revokeTokenAllowanceForPermit2({ owner, token })

      const allowance = await approval.getTokenAllowanceForPermit2({ owner, token })
      expect(allowance.toNumber()).toBe(0)
    })
  })
  describe('setPermit2Allowance', () => {
    it('permits Universal Router for USDT', async () => {
      const originalPermit = await approval.getPermit2Allowance({ owner, token })
      expect(originalPermit.amount.toNumber()).toBe(0)
      expect(originalPermit.expiration).toBe(0)

      await approval.setPermit2Allowance({ owner, token }, { amount: BigNumber.from(5), expiration: 1000 })

      const updatedAllowance = await approval.getPermit2Allowance({ owner, token })
      expect(updatedAllowance.amount.toNumber()).toBe(5)
      expect(updatedAllowance.expiration).toBe(1000)
    })
    it("revokes Universal Router's permit for USDT", async () => {
      await approval.setPermit2Allowance({ owner, token }, { amount: BigNumber.from(5), expiration: 1000 })
      await approval.revokePermit2Allowance({ owner, token })

      const allowance = await approval.getPermit2Allowance({ owner, token })

      expect(allowance.amount.toNumber()).toBe(0)
      expect(allowance.expiration).toBeLessThan(Date.now() / 1000)
    })
  })
})
