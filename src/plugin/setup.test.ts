/**
 * This test intentionally runs in the jest environment, so it will fail to link hardhat's asm dependency.
 * This is expected, and necessary in order collect coverage.
 */

import { hexlify } from '@ethersproject/bytes'
import { ChainId } from '@uniswap/sdk-core'
import { resetHardhatContext } from 'hardhat/plugins-testing'
import { HardhatNetworkHDAccountsConfig, HardhatRuntimeEnvironment } from 'hardhat/types'

let hre: HardhatRuntimeEnvironment
let setup: typeof import('./setup').default
beforeEach(async () => {
  resetHardhatContext()
  hre = (await import('hardhat')).default as typeof hre
  setup = (await import('./setup')).default
})

beforeEach(jest.resetModules)

describe('setup', () => {
  it('throws if forking is not configured', async () => {
    delete hre.config.networks.hardhat.forking
    await expect(setup()).rejects.toThrow('`forking` must be specified to use `cypress-hardhat`.')
  })

  describe('with valid configuration', () => {
    let send: jest.SpyInstance
    let env: Awaited<ReturnType<typeof setup>>
    beforeEach(() => {
      send = jest.spyOn(hre.network.provider, 'send')
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
      await expect(hre.network.provider.send('eth_chainId', [])).resolves.toBe('0x1')
    })

    it('resets the environment', async () => {
      env = await setup()
      const blockNumber = await hre.network.provider.send('eth_blockNumber', [])
      hre.network.provider.send('evm_setAutomine', [false])
      hre.network.provider.send('evm_mine', [])

      await env.reset()
      expect(send).toHaveBeenCalledWith('hardhat_reset', [
        {
          hardhat: { mining: expect.objectContaining({ auto: true }) },
          forking: expect.objectContaining({
            jsonRpcUrl: expect.any(String),
            blockNumber: expect.any(Number),
            httpHeaders: expect.any(Object),
          }),
        },
      ])
      await expect(hre.network.provider.send('eth_chainId', [])).resolves.toBe('0x1')
      await expect(hre.network.provider.send('eth_blockNumber', [])).resolves.toBe(blockNumber)
      await expect(hre.network.provider.send('hardhat_getAutomine', [])).resolves.toBe(true)
    })

    it('resets the environment with another chainId', async () => {
      env = await setup()

      await expect(env.reset(ChainId.OPTIMISM)).rejects.toThrow('No fork configured for chainId(0x0a)')

      await env.reset(ChainId.POLYGON)
      await expect(hre.network.provider.send('eth_chainId', [])).resolves.toBe('0x89')

      await env.reset(ChainId.MAINNET)
      await expect(hre.network.provider.send('eth_chainId', [])).resolves.toBe('0x1')
    })

    describe('provider', () => {
      it('delegates calls', async () => {
        env = await setup()
        const request = await fetch(env.url, {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
            id: 1,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        })
        await expect(request.json()).resolves.toEqual(expect.objectContaining({ result: '0x1' }))
      })

      describe('EIP-3326', () => {
        it('polyfills wallet_switchEthereumChain', async () => {
          env = await setup()

          const optimismRequest = await fetch(env.url, {
            method: 'POST',
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: hexlify(ChainId.OPTIMISM) }],
              id: 1,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
          })
          await expect(optimismRequest.json()).resolves.toEqual(
            expect.objectContaining({
              error: expect.objectContaining({ message: 'Error: No fork configured for chainId(0x0a)' }),
            })
          )

          const polygonRequest = await fetch(env.url, {
            method: 'POST',
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: hexlify(ChainId.POLYGON) }],
              id: 1,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
          })
          await expect(polygonRequest.json()).resolves.toEqual(expect.objectContaining({ result: null }))
          await expect(hre.network.provider.send('eth_chainId', [])).resolves.toBe('0x89')
        })
      })
    })

    describe('accounts', () => {
      function getAccountsConfig() {
        return hre.network.config.accounts as HardhatNetworkHDAccountsConfig
      }

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
  })
})
