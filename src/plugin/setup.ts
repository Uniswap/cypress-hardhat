import '../types/hardhat.config'

import http from 'node:http'

import { hexlify } from '@ethersproject/bytes'
import hre from 'hardhat'
import { TASK_NODE, TASK_NODE_GET_PROVIDER, TASK_NODE_SERVER_READY } from 'hardhat/builtin-tasks/task-names'
import { extendConfig } from 'hardhat/config'
import { createProvider } from 'hardhat/internal/core/providers/construction'
import { EthereumProvider, HardhatNetworkAccountsConfig } from 'hardhat/types'

import { Network } from '../types/Network'
import { toExternallyOwnedAccounts } from './accounts'

const PORT = 8545

/* istanbul ignore next */
extendConfig((config, userConfig) => {
  config.forks = userConfig.forks || {}
})

type ChainServer = { address: string; port: number; close: () => Promise<void>; provider: EthereumProvider }
const chainServers: ChainServer[] = []

/**
 * Initializes a chain server.
 * The provider *must* be configured for the chainId before calling runChainServer.
 */
function runChainServer(chainId: number): Promise<ChainServer> {
  if (chainServers[chainId]) return Promise.resolve(chainServers[chainId])

  const run = hre.run(TASK_NODE, { port: PORT + chainId })
  return new Promise((resolve) =>
    hre.tasks[TASK_NODE_SERVER_READY].setAction(async ({ address, port, provider, server }) => {
      const close = async () => {
        await Promise.all([server.close(), run])
      }
      chainServers[chainId] = { address, port, close, provider }
      resolve(chainServers[chainId])
    })
  )
}

/** Sets up the hardhat environment for use with cypress. */
export default async function setup(): Promise<
  Network & {
    /** Resets the hardhat environment. Call before a spec to reset the environment. */
    reset: (chainId?: number) => Promise<void>
    /** Tears down the hardhat environment. Call after a run to clean up the environment. */
    close: () => Promise<void>
  }
> {
  const forkConfigs = hre.config.forks
  const hardhatConfig = hre.config.networks.hardhat
  const defaultChainId = hardhatConfig.chainId
  const defaultForking = hardhatConfig.forking
  if (!defaultForking) {
    throw new Error(
      '`forking` must be specified to use `cypress-hardhat`.\nSee https://hardhat.org/hardhat-network/guides/mainnet-forking.html#mainnet-forking.'
    )
  }

  async function reset(chainId?: number) {
    const forkConfig = chainId ? forkConfigs[chainId] : defaultForking
    chainId = chainId ?? defaultChainId
    if (!forkConfig) throw new Error(`No fork configured for chainId(${hexlify(chainId)})`)

    // Switching chains requires that the node be restarted.
    // See https://github.com/NomicFoundation/hardhat/issues/3074.
    if (hre.network.config.chainId !== chainId) {
      hre.config.networks.hardhat.chainId = chainId
      hre.config.networks.hardhat.forking = { enabled: true, ...forkConfig }

      // Re-defines the network provider, which actually runs the hardhat note. Hardhat does not allow this to be
      // re-initialized, so it will be stuck on defaultChainId otherwise.
      // This is brittle because it requires using the internal createProvider method, which may not be stable;
      // but it is the only way to run a new chain at runtime.
      hre.network.provider =
        chainServers[chainId]?.provider ?? createProvider('hardhat', hardhatConfig, hre.config.paths, hre.artifacts)

      server = await runChainServer(chainId)
    } else {
      return hre.network.provider.send('hardhat_reset', [
        {
          hardhat: { mining: hardhatConfig.mining },
          forking: {
            jsonRpcUrl: forkConfig.url,
            blockNumber: forkConfig.blockNumber,
            httpHeaders: forkConfig.httpHeaders,
          },
        },
      ])
    }
  }

  hre.tasks[TASK_NODE_GET_PROVIDER].setAction(async () => {
    // Use the network provider, which was redefined as part of reset(chainId).
    const provider = hre.network.provider

    const request = provider.request
    provider.request = async (...args) => {
      const [{ method, params }] = args

      // Handle wallet_switchEthereumChain requests.
      if (method === 'wallet_switchEthereumChain') {
        const [{ chainId }] = params as [{ chainId: string }]
        /* istanbul ignore next */
        if (hardhatConfig.loggingEnabled) {
          console.debug(`Switching to chainId(${chainId})`)
        }
        await reset(Number(chainId))
        return null
      }

      return request.call(provider, ...args)
    }
    return provider
  })

  // Initializes the servers.
  const forwardingServer = http.createServer((req, res) => {
    // Forward responses to the active server.
    req.pipe(
      http.request({ ...req, hostname: server.address, port: server.port }, (response) => {
        for (const header in response.headers) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          res.setHeader(header, response.headers[header]!)
        }
        response.pipe(res)
      })
    )
  })
  const listen = new Promise<void>((resolve) => forwardingServer.listen(PORT, resolve))
  const run = runChainServer(defaultChainId)

  // Deriving ExternallyOwnedAccounts is computationally intensive, so we do it while waiting for the server to come up.
  const accounts = toExternallyOwnedAccounts(hre.network.config.accounts as HardhatNetworkAccountsConfig)
  if (accounts.length > 4) {
    process.stderr.write(`${accounts.length} hardhat accounts specified - consider specifying fewer.\n`)
    process.stderr.write('Specifying multiple hardhat accounts will noticeably slow your test startup time.\n\n')
  }
  let [server] = await Promise.all([run, listen])

  return {
    url: 'http://' + server.address + ':' + PORT,
    accounts,
    reset,
    close: async () => {
      await Promise.all([
        new Promise((resolve) => forwardingServer.close(resolve)),
        ...chainServers.map((server) => server.close()),
      ])
    },
  }
}
