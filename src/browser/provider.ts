import { Network } from '@ethersproject/networks'
import { JsonRpcProvider } from '@ethersproject/providers'

export class HardhatProvider extends JsonRpcProvider {
  cachedNetwork: Network | null = null

  constructor(url: string) {
    super(url, /* allow the network to change */ 'any')
  }

  /** Resets internal state so that the block number may be "rewinded" and chain changes will be noted. */
  reset() {
    // Resets all internal block number guards and caches.
    // See https://github.com/ethers-io/ethers.js/blob/v5/packages/providers/src.ts/base-provider.ts#L1168-L1175.
    this._lastBlockNumber = -2
    this._fastBlockNumber = null as unknown as typeof this._fastBlockNumber
    this._fastBlockNumberPromise = null as unknown as typeof this._fastBlockNumberPromise
    this._fastQueryDate = 0
    this._emitted.block = -2
    this._maxInternalBlockNumber = -1024
    this._internalBlockNumber = null as unknown as typeof this._internalBlockNumber

    // Resets the network cache.
    this.cachedNetwork = null
  }

  /**
   * Treats the network as a static variable, unless reset.
   * This avoids excessive calls to eth_chainId (similar to StaticJsonRpcProvider), while still allowing the chain to
   * change. */
  async detectNetwork(): Promise<Network> {
    let network = this.cachedNetwork
    if (network === null) {
      network = await super.detectNetwork()
    }
    return network
  }
}
