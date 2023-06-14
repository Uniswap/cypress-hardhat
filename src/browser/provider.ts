import { Network } from '@ethersproject/networks'
import { JsonRpcProvider } from '@ethersproject/providers'

export class HardhatProvider extends JsonRpcProvider {
  cachedNetwork: Promise<Network> | null = null

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

    this._eventLoopCache = {} // allows re-polling for blockNumber (via this._cache)
    this.cachedNetwork = null // allows re-polling for network (via this.detectNetwork)
  }

  /**
   * Treats the network as a static variable, unless reset.
   * This avoids excessive calls to eth_chainId (similar to StaticJsonRpcProvider), while still allowing the chain to
   * change. */
  async detectNetwork(): Promise<Network> {
    if (this.cachedNetwork === null) {
      this.cachedNetwork = super.detectNetwork()
    }
    return this.cachedNetwork
  }
}
