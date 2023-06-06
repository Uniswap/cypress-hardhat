import { SupportedChainId } from '@uniswap/sdk-core'

import { Network } from '../types/Network'
import setup from './setup'

export async function setupHardhatEvents(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions) {
  // Allows plugin events to run in interactive mode.
  // This is necessary to reset the hardhat environment between specs.
  config.experimentalInteractiveRunEvents = true

  const env = await setup()

  on('task', {
    hardhat: (): Network => ({
      url: env.url,
      accounts: env.accounts,
    }),
    ['hardhat:reset']: (chainId?: number) => env.reset(chainId),
  })
  on('before:spec', () => env.reset(SupportedChainId.MAINNET))
  on('after:run', () => env.close())
}
