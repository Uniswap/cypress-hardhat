import setup from './plugin/setup'

export function setupHardhatEvents(on: Cypress.PluginEvents) {
  let env: Awaited<ReturnType<typeof setup>>

  on('before:run', async () => {
    env = await setup()
  })
  on('before:spec', () => env.reset())
  on('after:run', () => env.close())
  on('task', {
    hardhat: () => ({
      url: env.url,
      accounts: env.accounts,
    }),
  })
}
