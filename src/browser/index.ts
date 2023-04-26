/* eslint-disable import/no-unused-modules */

import { Network } from '../types/Network'
import { Utils } from './utils'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Chainable<Subject> {
      hardhat(): Chainable<Utils>
      task(event: 'hardhat'): Chainable<Network>
    }
  }
}

let hardhat: Utils

cy.hardhat = () => {
  if (hardhat) return cy.wrap(hardhat)

  return cy.task('hardhat').then((env) => {
    return (hardhat = new Utils(env))
  })
}
