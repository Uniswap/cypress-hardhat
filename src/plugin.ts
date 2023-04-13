import setup from './plugin/setup'

export async function setupHardhatEvents(on: Cypress.PluginEvents) {
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
