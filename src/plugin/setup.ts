import hre from 'hardhat'
import { TASK_NODE, TASK_NODE_GET_PROVIDER, TASK_NODE_SERVER_READY } from 'hardhat/builtin-tasks/task-names'
import { HardhatNetworkAccountsConfig, JsonRpcServer } from 'hardhat/types'

import { Network } from '../types/Network'
import { toExternallyOwnedAccounts } from './accounts'

/** Sets up the hardhat environment for use with cypress. */
export default async function setup(): Promise<
  Network & {
    /** Resets the hardhat environment. Call before a spec to reset the environment. */
    reset: () => Promise<void>
    /** Tears down the hardhat environment. Call after a run to clean up the environment. */
    close: () => Promise<void>
  }
> {
  const hardhatConfig = hre.config.networks.hardhat
  const forkingConfig = hardhatConfig.forking
  if (!forkingConfig) {
    throw new Error(
      '`forking` must be specified to use `cypress-hardhat`.\nSee https://hardhat.org/hardhat-network/guides/mainnet-forking.html#mainnet-forking.'
    )
  }

  // Overrides the GET_PROVIDER task to avoid unnecessary time-intensive evm calls.
  hre.tasks[TASK_NODE_GET_PROVIDER].setAction(async () => hre.network.provider)
  const port = 8545
  const run = hre.run(TASK_NODE, { port })
  const serverReady = new Promise<{ url: string; server: JsonRpcServer }>((resolve) =>
    hre.tasks[TASK_NODE_SERVER_READY].setAction(async ({ address, port, server }) => {
      const url = 'http://' + address + ':' + port
      resolve({ url, server })
    })
  )

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

  const { url, server } = await serverReady
  return {
    url,
    chainId: hre.config.networks.hardhat.chainId,
    accounts,
    reset: () =>
      hre.network.provider.send('hardhat_reset', [
        {
          hardhat: {
            mining: hardhatConfig.mining,
          },
          forking: {
            jsonRpcUrl: forkingConfig.url,
            blockNumber: forkingConfig.blockNumber,
            httpHeaders: forkingConfig.httpHeaders,
          },
        },
      ]),
    close: async () => {
      await server.close()
      await run
    },
  }
}
