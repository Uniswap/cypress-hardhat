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
    ['hardhat:reset']: async (chainId?: number) => {
      await env.reset(chainId)
      return null // A task must not return a value or null to indicate that it was handled.
    },
  })
  on('before:spec', () => env.reset())
  on('after:run', () => env.close())
}
