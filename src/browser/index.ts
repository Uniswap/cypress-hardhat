/* eslint-disable import/no-unused-modules */

import { Network } from '../types/Network'
import { Utils } from './utils'

let hardhat: Utils

cy.hardhat = () => {
  if (hardhat) return cy.wrap(hardhat)

  return cy.task('hardhat').then((env: Network) => {
    return (hardhat = new Utils(env))
  })
}
