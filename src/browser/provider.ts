import { StaticJsonRpcProvider } from '@ethersproject/providers'

export class HardhatProvider extends StaticJsonRpcProvider {
  /** Resets internal state so that the block number may be "rewinded". */
  async reset() {
    // Reset all internal block number guards and caches.
    // See https://github.com/ethers-io/ethers.js/blob/v5/packages/providers/src.ts/base-provider.ts#L1168-L1175.
    this._lastBlockNumber = -2
    this._fastBlockNumber = null as unknown as typeof this._fastBlockNumber
    this._fastBlockNumberPromise = null as unknown as typeof this._fastBlockNumberPromise
    this._fastQueryDate = 0
    this._emitted.block = -2
    this._maxInternalBlockNumber = -1024
    this._internalBlockNumber = null as unknown as typeof this._internalBlockNumber
  }
}
