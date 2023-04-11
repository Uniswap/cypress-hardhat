/**
 * This test intentionally runs in the jest environment, so it will fail to link hardhat's asm dependency.
 * This is expected, and necessary in order collect coverage.
 */

import { resetHardhatContext } from 'hardhat/plugins-testing'
import { HardhatNetworkHDAccountsConfig, HardhatRuntimeEnvironment } from 'hardhat/types'

function getAccountsConfig() {
  return hre.network.config.accounts as HardhatNetworkHDAccountsConfig
}

let hre: HardhatRuntimeEnvironment
let setup: typeof import('./setup').default
beforeEach(async () => {
  resetHardhatContext()
  jest.resetModules()
  hre = (await import('hardhat')).default as typeof hre
  setup = (await import('./setup')).default
})
afterEach(jest.restoreAllMocks)

describe('setup', () => {
  it('throws if forking is not configured', async () => {
    delete hre.config.networks.hardhat.forking
    await expect(setup()).rejects.toThrow('`forking` must be specified to use `cypress-hardhat`.')
  })

  describe('with valid configuration', () => {
    let send: jest.SpyInstance
    let env: Awaited<ReturnType<typeof setup>>
    beforeEach(() => {
      send = jest.spyOn(hre.network.provider, 'send').mockResolvedValue(undefined)
    })
    afterEach(async () => await env.close())

    it('sets up the environment', async () => {
      env = await setup()
      expect(env).toMatchObject({
        url: 'http://127.0.0.1:8545',
        accounts: [
          {
            address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
            privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
          },
          {
            address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
            privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
          },
        ],
      })

      await env.reset()
      expect(send).toHaveBeenCalledWith('hardhat_reset', [
        { forking: expect.objectContaining({ jsonRpcUrl: expect.any(String), blockNumber: expect.any(Number) }) },
      ])
    })

    describe('accounts', () => {
      it('does not warn if 4 accounts are specified', async () => {
        getAccountsConfig().count = 4
        const warn = jest.spyOn(process.stderr, 'write')
        env = await setup()
        expect(warn).not.toHaveBeenCalledWith(
          'Specifying multiple hardhat accounts will noticeably slow your test startup time.\n\n'
        )
      })

      it('warns if more than 4 accounts are specified', async () => {
        getAccountsConfig().count = 5
        const warn = jest.spyOn(process.stderr, 'write')
        env = await setup()
        expect(warn).toHaveBeenCalledWith(
          'Specifying multiple hardhat accounts will noticeably slow your test startup time.\n\n'
        )
      })
    })

    describe('logging', () => {
      it('does not enable logging', async () => {
        env = await setup()
        expect(send).not.toHaveBeenCalled()
      })

      it('enables logging with `loggingEnabled`', async () => {
        hre.config.networks.hardhat.loggingEnabled = true
        env = await setup()
        expect(send).toHaveBeenCalledWith('hardhat_setLoggingEnabled', [true])
      })
    })
  })
})
