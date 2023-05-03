import { Network } from '../types/Network'
import { Eip1193 } from './eip1193'
import { Utils } from './utils'

interface HardhatOptions {
  automine?: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      hardhat(options?: HardhatOptions): Chainable<Utils>
      provider(): Chainable<Eip1193>
      task(event: 'hardhat'): Chainable<Network>
    }
  }
}

let hardhat: Utils
Cypress.Commands.add('hardhat', (options?: HardhatOptions) => {
  return (hardhat ? cy.wrap(hardhat) : cy.task('hardhat').then((env) => (hardhat = new Utils(env)))).then(
    async (utils) => {
      if (options?.automine !== undefined) await utils.setAutomine(options.automine)
      return utils
    }
  )
})

let provider: Eip1193
Cypress.Commands.add('provider', () => {
  if (provider) return cy.wrap(provider)

  return cy.hardhat().then((hardhat) => {
    return (provider = new Eip1193(hardhat))
  })
})
