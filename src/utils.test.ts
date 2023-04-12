/**
 * This test intentionally runs in the jest environment, so it will fail to link hardhat's asm dependency.
 * This is expected, and necessary in order collect coverage.
 */

import { CurrencyAmount, Ether, Token } from '@uniswap/sdk-core'

import setup from './plugin/setup'
import { HardhatUtils } from './utils'

const CHAIN_ID = 1
const ETH = Ether.onChain(CHAIN_ID)
const UNI = new Token(CHAIN_ID, '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 18, 'UNI')
const USDT = new Token(CHAIN_ID, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT')
const USDT_TREASURY = '0x5754284f345afc66a98fbb0a0afe71e0f007b949'

let env: Awaited<ReturnType<typeof setup>>
let utils: HardhatUtils
beforeAll(async () => {
  env = await setup()
  utils = new HardhatUtils(env)
})
beforeEach(() => env.reset())
afterEach(jest.restoreAllMocks)
afterAll(() => env.close())

describe('Hardhat', () => {
  describe('account', () => {
    it('returns the first account', async () => {
      expect(utils.accounts[0]).toBe(utils.account)
    })
  })

  describe('providers', () => {
    it('lists accounts', async () => {
      const accounts = await Promise.all(utils.providers.map((provider) => provider.listAccounts()))
      const addresses = accounts.map(([address]) => address)
      expect(addresses).toEqual(utils.accounts.map(({ address }) => address))
    })

    it('provides signers', async () => {
      const signers = utils.providers.map((provider) => provider.getSigner())
      const addresses = await Promise.all(signers.map((signer) => signer.getAddress()))
      expect(addresses.map((address) => address.toLowerCase())).toEqual(utils.accounts.map(({ address }) => address))
    })

    it('returns the network', async () => {
      const network = await utils.provider.getNetwork()
      expect(network.chainId).toBe(CHAIN_ID)
    })
  })

  describe('provider', () => {
    it('returns the first provider', async () => {
      expect(utils.providers[0]).toBe(utils.provider)
    })
  })

  describe('getBalance', () => {
    describe('with an impersonated account', () => {
      it('returns ETH balance', async () => {
        const balance = await utils.getBalance(utils.account, ETH)
        expect(balance.toExact()).toBe('10000')
      })

      it('returns UNI balance', async () => {
        const balance = await utils.getBalance(utils.account, UNI)
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

  describe('setBalance', () => {
    it('calls into `fund`', async () => {
      const amount = CurrencyAmount.fromRawAmount(USDT, 10000).multiply(10 ** USDT.decimals)
      const whales = [USDT_TREASURY]
      const fund = jest.spyOn(HardhatUtils.prototype, 'fund').mockResolvedValue()
      await utils.setBalance(utils.account, amount, whales)
      expect(fund).toHaveBeenCalledWith(utils.account, amount, whales)
    })
  })

  describe('fund', () => {
    describe('with an impersonated account', () => {
      it('funds ETH balance', async () => {
        const amount = CurrencyAmount.fromRawAmount(ETH, 6000000).multiply(10 ** ETH.decimals)
        await utils.fund(utils.account, amount)
        const balance = await utils.getBalance(utils.account, ETH)
        expect(balance.toExact()).toBe('6000000')
      })

      it('funds UNI balance', async () => {
        const amount = CurrencyAmount.fromRawAmount(UNI, 6000000).multiply(10 ** UNI.decimals)
        await utils.fund(utils.account, amount)
        const balance = await utils.getBalance(utils.account, UNI)
        expect(balance.toExact()).toBe('6000000')
      })
    })

    describe('with an external address', () => {
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
      await expect(utils.fund(utils.account, amount, [MINNOW])).rejects.toThrow(
        'Could not fund 10000 USDT from any whales'
      )

      // Successfully fund from address with USDT.
      await utils.fund(utils.account, amount, [USDT_TREASURY])
      const balance = await utils.getBalance(utils.account, USDT)
      expect(balance.toExact()).toBe('10000')

      // Successfully funds when 2nd whale has USDT but 1st does not.
      await utils.fund(utils.account, amount, [MINNOW, USDT_TREASURY])
      const balance2 = await utils.getBalance(utils.account, USDT)
      expect(balance2.toExact()).toBe('20000')
    })
  })
})
