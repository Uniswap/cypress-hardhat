/**
 * This test intentionally runs in the jest environment, so it will fail to link hardhat's asm dependency.
 * This is expected, and necessary in order collect coverage.
 */

import { Wallet } from '@ethersproject/wallet'
import { CurrencyAmount, Ether, Token } from '@uniswap/sdk-core'

import setup from '../plugin/setup'
import { Network } from '../types/Network'
import { Utils } from './utils'

const CHAIN_ID = 1
const ETH = Ether.onChain(CHAIN_ID)
const UNI = new Token(CHAIN_ID, '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 18, 'UNI')
const USDT = new Token(CHAIN_ID, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT')
const USDT_TREASURY = '0x5754284f345afc66a98fbb0a0afe71e0f007b949'

let env: Awaited<ReturnType<typeof setup>>
let utils: Utils
beforeAll(async () => {
  env = await setup()
  utils = new Utils(env)
})
afterAll(() => env.close())

const globalWithCy = global as typeof global & { cy: Cypress.cy }
beforeAll(() => {
  globalWithCy.cy = { task: jest.fn() as Cypress.cy['task'] } as Cypress.cy
})

describe('Utils', () => {
  describe('reset', () => {
    beforeEach(() => {
      jest.mocked(cy.task).mockImplementation(() => env.reset() as unknown as Cypress.Chainable<Network>)
    })

    it('invokes hardhat:reset', () => {
      utils.reset()
      expect(cy.task).toHaveBeenCalledWith('hardhat:reset')
    })

    it('resets the providers', async () => {
      const initialBlockNumbers = await Promise.all(utils.providers.map((provider) => provider.getBlockNumber()))
      await utils.mine(100)
      await new Promise<void>((resolve) => {
        utils.reset().then(async () => {
          const blockNumbers = await Promise.all(utils.providers.map((provider) => provider.getBlockNumber()))
          expect(blockNumbers).toEqual(initialBlockNumbers)
          resolve()
        })
      })
    })
  })

  describe('network', () => {
    it('returns the network', () => {
      expect(utils.network).toMatchObject({
        accounts: expect.arrayContaining([
          expect.objectContaining({ address: expect.any(String), privateKey: expect.any(String) }),
        ]),
        chainId: 1,
        url: 'http://127.0.0.1:8545',
      })
    })
  })

  describe('providers', () => {
    it('lists accounts', async () => {
      const accounts = await Promise.all(utils.providers.map((provider) => provider.listAccounts()))
      const addresses = accounts.map(([address]) => address)
      expect(addresses).toEqual(utils.network.accounts.map(({ address }) => address))
    })

    it('provides signers', () => {
      const signers = utils.providers.map((provider) => provider.getSigner())
      expect(signers).toEqual(utils.wallets)
    })

    it('returns the network', async () => {
      const network = await utils.provider.getNetwork()
      expect(network.chainId).toBe(CHAIN_ID)
    })

    it('provider returns the first provider', () => {
      expect(utils.provider).toBe(utils.providers[0])
    })
  })

  describe('wallets', () => {
    it('are wallets', () => {
      expect(utils.wallets.every((wallet) => wallet instanceof Wallet)).toBeTruthy()
    })

    it('reflects accounts', () => {
      expect(
        utils.wallets.map((wallet) => ({
          address: wallet.address.toLowerCase(),
          privateKey: wallet.privateKey,
        }))
      ).toEqual(utils.network.accounts)
    })

    it('wallet returns the first wallet', () => {
      expect(utils.wallet).toBe(utils.wallets[0])
    })
  })

  describe('getBalance', () => {
    describe('with an impersonated account', () => {
      it('returns ETH balance', async () => {
        const balance = await utils.getBalance(utils.wallet, ETH)
        expect(balance.toExact()).toBe('10000')
      })

      it('returns UNI balance', async () => {
        const balance = await utils.getBalance(utils.wallet, UNI)
        expect(balance.toExact()).toBe('0')
      })
    })

    describe('with an external address', () => {
      const address = '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8'

      it('returns ETH balance', async () => {
        const balance = await utils.getBalance(address, ETH)
        expect(balance.toExact()).toBe('1996008.361994350150225987')
      })

      it('returns UNI balance', async () => {
        const balance = await utils.getBalance(address, UNI)
        expect(balance.toExact()).toBe('6000000')
      })
    })
  })

  describe('send', () => {
    it('delegates to the provider', async () => {
      jest.spyOn(utils.provider, 'send').mockResolvedValue('baz')
      await expect(utils.send('eth_foo', ['bar'])).resolves.toBe('baz')
      expect(utils.provider.send).toHaveBeenCalledWith('eth_foo', ['bar'])
    })
  })

  describe('setBalance', () => {
    afterEach(async () => await env.reset())
    it('calls into `fund`', async () => {
      const amount = CurrencyAmount.fromRawAmount(USDT, 10000).multiply(10 ** USDT.decimals)
      const whales = [USDT_TREASURY]
      const fund = jest.spyOn(Utils.prototype, 'fund').mockResolvedValue()
      await utils.setBalance(utils.wallet, amount, whales)
      expect(fund).toHaveBeenCalledWith(utils.wallet, amount, whales)
    })
  })

  describe('fund', () => {
    afterEach(async () => await env.reset())
    describe('with an impersonated account', () => {
      it('funds ETH balance', async () => {
        const amount = CurrencyAmount.fromRawAmount(ETH, 6000000).multiply(10 ** ETH.decimals)
        await utils.fund(utils.wallet, amount)
        const balance = await utils.getBalance(utils.wallet, ETH)
        expect(balance.toExact()).toBe('6000000')
      })

      it('funds UNI balance', async () => {
        const amount = CurrencyAmount.fromRawAmount(UNI, 6000000).multiply(10 ** UNI.decimals)
        await utils.fund(utils.wallet, amount)
        const balance = await utils.getBalance(utils.wallet, UNI)
        expect(balance.toExact()).toBe('6000000')
      })
    })

    describe('with an external address', () => {
      afterEach(async () => await env.reset())
      const address = '0x6555e1cc97d3cba6eaddebbcd7ca51d75771e0b8'

      it('funds ETH balance', async () => {
        const amount = CurrencyAmount.fromRawAmount(ETH, 6000000).multiply(10 ** ETH.decimals)
        await utils.fund(address, amount)
        const balance = await utils.getBalance(address, ETH)
        expect(balance.toExact()).toBe('6000000')
      })

      it('funds UNI balance', async () => {
        const amount = CurrencyAmount.fromRawAmount(UNI, 6000000).multiply(10 ** UNI.decimals)
        await utils.fund(address, amount)
        const balance = await utils.getBalance(address, UNI)
        expect(balance.toExact()).toBe('6000000.474792305572453152') // includes existing funds
      })
    })

    it('uses custom whales', async () => {
      const MINNOW = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
      const amount = CurrencyAmount.fromRawAmount(USDT, 10000).multiply(10 ** USDT.decimals)

      // Try fund from address with no USDT.
      await expect(utils.fund(utils.wallet, amount, [MINNOW])).rejects.toThrow(
        'Could not fund 10000 USDT from any whales'
      )

      // Successfully fund from address with USDT.
      await utils.fund(utils.wallet, amount, [USDT_TREASURY])
      const balance = await utils.getBalance(utils.wallet, USDT)
      expect(balance.toExact()).toBe('10000')

      // Successfully funds when 2nd whale has USDT but 1st does not.
      await utils.fund(utils.wallet, amount, [MINNOW, USDT_TREASURY])
      const balance2 = await utils.getBalance(utils.wallet, USDT)
      expect(balance2.toExact()).toBe('20000')
    })
  })

  describe('setAutomine', () => {
    afterEach(async () => await env.reset())
    it('sets automine to true', async () => {
      await utils.setAutomine(false)
      await expect(utils.send('hardhat_getAutomine', [])).resolves.toBe(false)

      await utils.setAutomine(true)
      await expect(utils.send('hardhat_getAutomine', [])).resolves.toBe(true)
    })
  })

  describe('mine', () => {
    afterEach(async () => await env.reset())
    it('mines 1 block with 12s interval by default', async () => {
      const block = await utils.send('eth_getBlockByNumber', ['latest', false])
      await utils.mine()
      const latest = await utils.send('eth_getBlockByNumber', ['latest', false])
      expect(Number(latest.number)).toBe(Number(block.number) + 1)
      expect(Number(latest.timestamp)).toBe(Number(block.timestamp) + 12)
    })

    it('mines n blocks with blockInterval', async () => {
      const block = await utils.send('eth_getBlockByNumber', ['latest', false])
      await utils.mine(100, 42)
      const latest = await utils.send('eth_getBlockByNumber', ['latest', false])
      expect(Number(latest.number)).toBe(Number(block.number) + 100)
      expect(Number(latest.timestamp)).toBe(Number(block.timestamp) + 42 * 100)
    })
  })
})
