/// <reference types="cypress" />

import '../../src/browser'

import { Eip1193 } from '../../src/browser/eip1193'

declare global {
  interface Window {
    ethereum: Eip1193
  }
}

Cypress.Commands.overwrite(
  'visit',
  (
    originalFn,
    originalUrl: string | Partial<Cypress.VisitOptions>,
    originalOptions?: Partial<Cypress.VisitOptions>
  ) => {
    const url = typeof originalUrl === 'string' ? originalUrl : originalUrl.url
    if (!url) throw new Error('Missing url')

    const options = (typeof originalUrl === 'string' ? originalOptions : originalUrl) ?? {}

    return cy.provider().then((provider) =>
      originalFn({
        ...options,
        url,
        onBeforeLoad(win) {
          options.onBeforeLoad?.(win)
          window.ethereum = provider
        },
      })
    )
  }
)
