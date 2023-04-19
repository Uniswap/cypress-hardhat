# cypress-hardhat

[![npm](https://img.shields.io/npm/v/cypress-hardhat)](https://www.npmjs.com/package/cypress-hardhat)
[![Tests](https://github.com/Uniswap/cypress-hardhat/actions/workflows/test.yaml/badge.svg)](https://github.com/Uniswap/cypress-hardhat/actions/workflows/test.yaml)

A jest environment with hardhat built in.

`cypress-hardhat` is a hardhat plugin for running a hardhat fork for your tests. Instead of running a separate `hardhat node`, this environment runs a node and communicates the url and test accounts to cypress - with some test utilities to boot.

## Installation

First, install `cypress-hardhat` and its dependencies (using `yarn` or `npm`).

The environment needs `ethers`, and `hardhat` installed as well. These are installed as peer dependencies to ensure that you retain control over versioning, so you'll need to install them explicitly:

```sh
yarn add -D ethers hardhat
yarn add -D cypress-hardhat
```

Then, set up your `hardhat.config.js` file.
You'll need to [configure mainnet forking](https://hardhat.org/hardhat-network/guides/mainnet-forking#forking-from-mainnet) to set the initial state of the hardhat network within jest.

NOTE: You should set the [`accounts` field](https://hardhat.org/hardhat-network/reference#accounts) to include as few accounts as possible to reduce startup time for your tests' hardhat network.

Then, install the plugin in your cypress configuration (see the [cypress documentation](https://docs.cypress.io/guides/tooling/plugins-guide#Using-a-plugin) for details):

```
import { setupHardhatEvents } from 'cypress-hardhat'

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // Install the plugin here
      setupHardhatEvents(on)
    },
  },
})
```

In addition, `cypress-hardhat` includes some utilities for seeding your environment. These should be imported into your browser testing environment, *not* in your configuration:

```
import { CurrencyAmount, Ether, Token } from '@uniswap/sdk-core'
import { HardhatUtils, Network } from 'cypress-hardhat/lib/browser'

declare global {
  namespace Cyrpess {
    interface Chainable<Subject> {
      task(event: 'hardhat'): Chainable<Network>
    }
  }
}

const ETH = Ether.onChain(CHAIN_ID)
const amount = CurrencyAmount.fromRawAmount(ETH, 6000000).multiply(10 ** ETH.decimals)

it('communicates with hardhat', () => {
  cy.task('hardhat').then((network) => {
    const hardhat = new HardhatUtils(network)
    hardhat.fund(hardhat.account, amount)
  })
})
```

For example, this can be used to inject a mock window.ethereum object that will communicate with hardhat.

---

Made with 🦄 by [Uniswap Labs](https://uniswap.org)
