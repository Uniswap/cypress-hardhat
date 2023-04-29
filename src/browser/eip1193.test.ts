/**
 * This test intentionally runs in the jest environment, so it will fail to link hardhat's asm dependency.
 * This is expected, and necessary in order collect coverage.
 */

import { Eip1193Bridge } from '@ethersproject/experimental/lib/eip1193-bridge'

import setup from '../plugin/setup'
import { Eip1193 } from './eip1193'
import { Utils } from './utils'

let env: Awaited<ReturnType<typeof setup>>
let utils: Utils
let provider: Eip1193
beforeAll(async () => {
  env = await setup()
  utils = new Utils(env)
  provider = new Eip1193(utils)
})
afterAll(() => env.close())

describe('Eip1193', () => {
  beforeEach(() => {
    // Squelches console.debug
    jest.spyOn(console, 'debug').mockReturnValue()
  })

  it('sendAsync delegates to send', async () => {
    jest.spyOn(provider, 'send').mockResolvedValueOnce('baz')
    await expect(provider.sendAsync('foo', ['bar'])).resolves.toBe('baz')
    expect(provider.send).toHaveBeenCalledWith('foo', ['bar'])
  })

  describe('accepts callback form', () => {
    it('calls back with an error', async () => {
      const callback = jest.fn()
      const error = new Error('baz')
      const send = jest.spyOn(Eip1193Bridge.prototype, 'send').mockRejectedValueOnce(error)
      await provider.send({ method: 'foo', params: ['bar'] }, callback)
      expect(send).toHaveBeenCalledWith('foo', ['bar'])
      expect(callback).toHaveBeenCalledWith(error)
    })

    it('calls back with a result', async () => {
      const callback = jest.fn()
      const send = jest.spyOn(Eip1193Bridge.prototype, 'send').mockResolvedValueOnce('baz')
      await provider.send({ method: 'foo', params: ['bar'] }, callback)
      expect(send).toHaveBeenCalledWith('foo', ['bar'])
      expect(callback).toHaveBeenCalledWith(null, { result: 'baz' })
    })
  })

  it('throws an error', async () => {
    await expect(provider.send('eth_unknownMethod')).rejects.toThrow()
  })

  describe('reads', () => {
    it('eth_requestAccounts', async () => {
      await expect(provider.send('eth_requestAccounts')).resolves.toEqual([utils.wallet.address])
    })

    it('eth_accounts', async () => {
      await expect(provider.send('eth_accounts')).resolves.toEqual([utils.wallet.address])
    })

    it('eth_chainId', async () => {
      await expect(provider.send('eth_chainId')).resolves.toEqual('0x1')
    })

    it('eth_blockNumber', async () => {
      const send = jest.spyOn(Eip1193Bridge.prototype, 'send')
      await expect(provider.send('eth_blockNumber')).resolves.toEqual(expect.any(Number))
      expect(send).toHaveBeenCalledWith('eth_blockNumber', undefined)
    })
  })

  describe('writes', () => {
    afterEach(async () => await env.reset())

    it('eth_sendTransaction', async () => {
      const tx = await provider.send('eth_sendTransaction', [
        {
          from: utils.wallet.address,
          to: utils.wallets[1].address,
          value: 1,
          gas: 21000,
        },
      ])
      expect(tx).toMatch(/^0x[0-9a-f]{64}$/)
    })
  })
})
