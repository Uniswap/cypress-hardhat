/**
 * This test intentionally runs in the jest environment, so it will fail to link hardhat's asm dependency.
 * This is expected, and necessary in order collect coverage.
 */

import { MaxUint160, MaxUint256 } from '@uniswap/permit2-sdk'
import { Token } from '@uniswap/sdk-core'
import { constants } from 'ethers/lib/ethers'

import setup from '../plugin/setup'
import { ApprovalUtils } from './approval'
import { AddressLike } from './types'
import { Utils } from './utils'

const token = new Token(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT')

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
beforeEach(async () => await env.reset())
afterAll(() => env.close())

const globalWithCy = global as typeof global & { cy: Cypress.cy }
beforeAll(() => {
  globalWithCy.cy = { task: jest.fn() as Cypress.cy['task'] } as Cypress.cy
})

describe('Approval', () => {
  describe('setTokenAllowance', () => {
    it('approves USDT', async () => {
      const originalAllowance = await approval.getTokenAllowance({ owner, token, spender })
      expect(originalAllowance.eq(0)).toBeTruthy()

      await approval.setTokenAllowance({ owner, token, spender }, 5)

      const updatedAllowance = await approval.getTokenAllowance({ owner, token, spender })
      expect(updatedAllowance.eq(5)).toBeTruthy()
    })
    it('approves max token allowance by default', async () => {
      await approval.setTokenAllowance({ owner, token, spender })

      const updatedAllowance = await approval.getTokenAllowance({ owner, token, spender })
      expect(updatedAllowance).toMatchObject(constants.MaxUint256)
    })
    it('revokes USDT', async () => {
      await approval.setTokenAllowance({ owner, token, spender }, 5)
      await approval.revokeTokenAllowance({ owner, token, spender })

      const allowance = await approval.getTokenAllowance({ owner, token, spender })
      expect(allowance.eq(0)).toBeTruthy()
    })
  })
  describe('setTokenAllowanceForPermit2', () => {
    it('approves USDT for Permit2', async () => {
      const originalAllowance = await approval.getTokenAllowanceForPermit2({ owner, token })
      expect(originalAllowance.eq(0)).toBeTruthy()

      await approval.setTokenAllowanceForPermit2({ owner, token }, 5)

      const updatedAllowance = await approval.getTokenAllowanceForPermit2({ owner, token })
      expect(updatedAllowance.eq(5)).toBeTruthy()
    })
    it('approves max token allowance by default', async () => {
      await approval.setTokenAllowanceForPermit2({ owner, token })

      const allowance = await approval.getTokenAllowanceForPermit2({ owner, token })
      expect(allowance).toMatchObject(MaxUint256)
    })
    it('revokes USDT for Permit2', async () => {
      await approval.setTokenAllowanceForPermit2({ owner, token }, 5)
      await approval.revokeTokenAllowanceForPermit2({ owner, token })

      const allowance = await approval.getTokenAllowanceForPermit2({ owner, token })
      expect(allowance.eq(0)).toBeTruthy()
    })
  })
  describe('setPermit2Allowance', () => {
    it('permits Universal Router for USDT', async () => {
      const originalAllowance = await approval.getPermit2Allowance({ owner, token })
      expect(originalAllowance.amount.eq(0)).toBeTruthy()

      await approval.setPermit2Allowance({ owner, token }, { amount: 5, expiration: 1000 })

      const updatedAllowance = await approval.getPermit2Allowance({ owner, token })
      expect(updatedAllowance.amount.eq(5)).toBeTruthy()
      expect(updatedAllowance.expiration).toBe(1000)
    })
    it('permits max permit allowance by default', async () => {
      await approval.setPermit2Allowance({ owner, token }, { expiration: 1000 })

      const updatedAllowance = await approval.getPermit2Allowance({ owner, token })
      expect(updatedAllowance.amount).toMatchObject(MaxUint160)
    })
    it('permits with a 30 day expiration by default', async () => {
      await approval.setPermit2Allowance({ owner, token }, { amount: 5 })

      const updatedAllowance = await approval.getPermit2Allowance({ owner, token })
      expect(updatedAllowance.expiration).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 2_592_000)
    })
    it('permits default amount/expiration when no approval is passed', async () => {
      await approval.setPermit2Allowance({ owner, token })

      const updatedAllowance = await approval.getPermit2Allowance({ owner, token })
      expect(updatedAllowance.expiration).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 2_592_000)
      expect(updatedAllowance.amount).toMatchObject(MaxUint160)
    })
    it('permits default amount/expiration when empty object is passed', async () => {
      await approval.setPermit2Allowance({ owner, token }, {})

      const updatedAllowance = await approval.getPermit2Allowance({ owner, token })
      expect(updatedAllowance.expiration).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 2_592_000)
      expect(updatedAllowance.amount).toMatchObject(MaxUint160)
    })
    it("revokes Universal Router's permit for USDT", async () => {
      await approval.setPermit2Allowance({ owner, token }, { amount: 5, expiration: 1000 })
      await approval.revokePermit2Allowance({ owner, token })

      const allowance = await approval.getPermit2Allowance({ owner, token })

      expect(allowance.amount.eq(0)).toBeTruthy()
      expect(allowance.expiration).toBeLessThan(Date.now() / 1000)
    })
  })
})
