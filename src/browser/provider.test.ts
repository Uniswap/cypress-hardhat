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
      jest.mocked(fetchJson).mockResolvedValueOnce('0x1')
      await provider.getNetwork()

      jest.mocked(fetchJson).mockResolvedValueOnce('0x3')
      await expect(provider.getBlockNumber()).resolves.toEqual(3)

      // Without reset, an earlier blockNumber is not accepted.
      jest.mocked(fetchJson).mockResolvedValueOnce('0x2')
      await new Promise((resolve) => setTimeout(resolve))
      await expect(provider.getBlockNumber()).resolves.toEqual(3)

      provider.reset()
      jest.mocked(fetchJson).mockResolvedValueOnce('0x1')
      await provider.getNetwork()
      jest.mocked(fetchJson).mockResolvedValueOnce('0x2')
      await expect(provider.getBlockNumber()).resolves.toEqual(2)
    })

    it('allows network changes', async () => {
      const provider = new HardhatProvider('http://localhost:8545')

      jest.mocked(fetchJson).mockResolvedValueOnce('0x1')
      await expect(provider.getNetwork()).resolves.toEqual(expect.objectContaining({ chainId: 1 }))

      jest.mocked(fetchJson).mockResolvedValueOnce('0x2')
      provider.reset()
      await expect(provider.getNetwork()).resolves.toEqual(expect.objectContaining({ chainId: 2 }))
    })
  })
})
