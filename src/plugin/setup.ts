import '../types/hardhat.config'

import hre from 'hardhat'
import { TASK_NODE, TASK_NODE_GET_PROVIDER, TASK_NODE_SERVER_READY } from 'hardhat/builtin-tasks/task-names'
import { extendConfig } from 'hardhat/config'
import { createProvider } from 'hardhat/internal/core/providers/construction'
import { EthereumProvider, HardhatNetworkAccountsConfig } from 'hardhat/types'
import http from 'http'

import { Network } from '../types/Network'
import { toExternallyOwnedAccounts } from './accounts'

extendConfig((config, userConfig) => {
  /* istanbul ignore next */
  config.forks = userConfig.forks || {}
})

type Server = { address: string; port: number; close: () => Promise<void>; provider: EthereumProvider }

const servers: Server[] = []

function url(address: string, port: number) {
  return 'http://' + address + ':' + port
}

function runServer(chainId: number): Promise<Server> {
  if (servers[chainId]) return Promise.resolve(servers[chainId])

  const run = hre.run(TASK_NODE, { port: 8545 + chainId })
  return new Promise((resolve) =>
    hre.tasks[TASK_NODE_SERVER_READY].setAction(async ({ address, port, provider, server }) => {
      const close = async () => {
        await Promise.all([server.close(), run])
      }
      servers[chainId] = { address, port, close, provider }
      resolve(servers[chainId])
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
    const targetChainId = chainId ?? defaultChainId
    const forkConfig = chainId ? forkConfigs[chainId] : defaultForking
    if (!forkConfig) throw new Error(`No fork configured for chainId(${chainId})`)

    // Switching chains requires that the node be restarted.
    // See https://github.com/NomicFoundation/hardhat/issues/3074.
    if (hre.network.config.chainId !== targetChainId) {
      hre.config.networks.hardhat.chainId = targetChainId
      hre.config.networks.hardhat.forking = { enabled: true, ...forkConfig }

      // Re-defines the network provider, which actually runs the hardhat note. Hardhat does not allow this to be
      // re-initialized, so it will be stuck on defaultChainId otherwise. This is brittle because it requires using
      // the internal createProvider method, but it is the only way to switch chains at runtime.
      hre.network.provider =
        servers[targetChainId]?.provider ?? createProvider('hardhat', hardhatConfig, hre.config.paths, hre.artifacts)

      server = await runServer(targetChainId)
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

  // Overrides the GET_PROVIDER task to avoid unnecessary time-intensive evm calls.
  hre.tasks[TASK_NODE_GET_PROVIDER].setAction(async () => {
    const provider = hre.network.provider
    const request = provider.request
    provider.request = async (...args) => {
      const [{ method, params }] = args
      if (method === 'wallet_switchEthereumChain') {
        const [{ chainId }] = params as [{ chainId: string }]
        console.debug(`Switching to chainId(${Number(chainId)})`)
        await reset(Number(chainId))
        return null
      }
      return request.call(provider, ...args)
    }
    return provider
  })

  // Initializes the server.
  const run = runServer(defaultChainId)

  // Deriving ExternallyOwnedAccounts is computationally intensive, so we do it while waiting for the server to come up.
  const accounts = toExternallyOwnedAccounts(hre.network.config.accounts as HardhatNetworkAccountsConfig)
  if (accounts.length > 4) {
    process.stderr.write(`${accounts.length} hardhat accounts specified - consider specifying fewer.\n`)
    process.stderr.write('Specifying multiple hardhat accounts will noticeably slow your test startup time.\n\n')
  }

  // Enables logging if it was enabled in the hardhat config.
  if (hre.config.networks.hardhat.loggingEnabled) {
    await hre.network.provider.send('hardhat_setLoggingEnabled', [true])
  }

  let server = await run
  const forwardingServer = http
    .createServer((req, res) => {
      console.debug(`Forwarding ${req.method} ${req.url} to chainId(${server.port - 8545})`)
      // Forward responses to the active server.
      req.pipe(
        http.request({ ...req, port: server.port }, (response) => {
          for (const header in response.headers) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            res.setHeader(header, response.headers[header]!)
          }
          response.pipe(res)
        })
      )
    })
    .listen(8545)
  return {
    url: url(server.address, 8545),
    accounts,
    reset,
    close: async () => {
      await Promise.all([
        new Promise((resolve) => forwardingServer.close(resolve)),
        ...servers.map((server) => server.close()),
      ])
    },
  }
}
