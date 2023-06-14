import { fetchJson } from '@ethersproject/web'

import { HardhatProvider } from './provider'

jest.mock('@ethersproject/web', () => ({
  fetchJson: jest.fn(),
}))

describe('HardhatProvider', () => {
  it('caches network across eth_chainId calls', async () => {
    const provider = new HardhatProvider('http://localhost:8545')

    jest.mocked(fetchJson).mockResolvedValueOnce('0x1')
    const network = await provider.getNetwork()
    await expect(provider.getNetwork()).resolves.toBe(network)
  })

  describe('reset', () => {
    it('allows an earlier blockNumber', async () => {
      const provider = new HardhatProvider('http://localhost:8545')

      jest.mocked(fetchJson).mockReset().mockResolvedValueOnce('0x3').mockResolvedValue('0x2')
      await expect(provider.send('eth_blockNumber', [])).resolves.toEqual('0x3')

      provider.reset()
      await expect(provider.send('eth_blockNumber', [])).resolves.toEqual('0x2')
    })

    it('allows network changes', async () => {
      const provider = new HardhatProvider('http://localhost:8545')

      jest.mocked(fetchJson).mockResolvedValueOnce('0x1').mockResolvedValueOnce('0x2')
      await expect(provider.send('eth_chainId', [])).resolves.toEqual('0x1')

      provider.reset()
      await expect(provider.send('eth_chainId', [])).resolves.toEqual('0x2')
    })
  })
})
