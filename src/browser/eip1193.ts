import { Eip1193Bridge } from '@ethersproject/experimental/lib/eip1193-bridge'
import { JsonRpcProvider } from '@ethersproject/providers'

import { Utils } from './utils'

export class Eip1193 extends Eip1193Bridge {
  readonly isMetaMask = true

  constructor(private utils: Utils) {
    super(utils.wallet, utils.provider)
  }

  async sendAsync(...args: any[]) {
    return this.send(...args)
  }

  async send(...args: any[]) {
    console.debug('hardhat:send', ...args)

    // Parse callback form.
    const isCallbackForm = typeof args[0] === 'object' && typeof args[1] === 'function'
    let callback = <T>(error: Error | null, result?: { result: T }) => {
      if (error) throw error
      return result?.result
    }
    let method: string
    let params: any[]
    if (isCallbackForm) {
      callback = args[1]
      method = args[0].method
      params = args[0].params
    } else {
      method = args[0]
      params = args[1]
    }

    let result
    try {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          result = [this.utils.wallet.address]
          break
        case 'eth_sendTransaction': {
          // Eip1193Bridge doesn't support .gas and .from directly, so we massage it to satisfy ethers' expectations.
          // See https://github.com/ethers-io/ethers.js/issues/1683.
          params[0].gasLimit = params[0].gas
          delete params[0].gas
          delete params[0].from

          const req = JsonRpcProvider.hexlifyTransaction(params[0])
          req.gasLimit = req.gas
          delete req.gas

          result = (await this.signer.sendTransaction(req)).hash
          break
        }
        case 'wallet_switchEthereumChain':
          // This switches to a new fork. In doing so, it also wipes the state of the current fork. This is irreversible
          // but is considered ok because this is a test environment.
          //
          // this.utils.reset returns a Chainable so it cannot be awaited, as nested Chainables will never resolve. This
          // is ok as long as it is done in an independent Cypress command, as Cypress will delay any further commands.
          this.utils.reset(Number(params[0].chainId))
          break
        default:
          result = await super.send(method, params)
      }
      console.debug('hardhat:receive', method, result)
      return callback(null, { result })
    } catch (error) {
      console.debug('hardhat:error', method, error)
      return callback(error as Error)
    }
  }
}
