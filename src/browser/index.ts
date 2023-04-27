import { Network } from '../types/Network'
import { Eip1193 } from './eip1193'
import { Utils } from './utils'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      hardhat(): Chainable<Utils>
      provider(): Chainable<Eip1193>
      task(event: 'hardhat'): Chainable<Network>
    }
  }
}

let hardhat: Utils
Cypress.Commands.add('hardhat', () => {
  if (hardhat) return cy.wrap(hardhat)

  return cy.task('hardhat').then((env) => {
    return (hardhat = new Utils(env))
  })
})

let provider: Eip1193
Cypress.Commands.add('provider', () => {
  if (provider) return cy.wrap(provider)

  return cy.hardhat().then((hardhat) => {
    return (provider = new Eip1193(hardhat))
  })
})
