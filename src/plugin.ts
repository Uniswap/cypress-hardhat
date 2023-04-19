import setup from './plugin/setup'

export async function setupHardhatEvents(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions) {
  // Allows plugin events to run in interactive mode.
  // This is necessary to reset the hardhat environment between specs.
  config.experimentalInteractiveRunEvents = true

  const env = await setup()

  on('task', {
    hardhat: () => ({
      url: env.url,
      accounts: env.accounts,
    }),
  })
  on('before:spec', () => env.reset())
  on('after:run', () => env.close())
}
