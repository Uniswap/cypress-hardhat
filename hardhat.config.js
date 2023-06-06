const { SupportedChainId } = require('@uniswap/sdk-core')

/* eslint-env node */
require('dotenv').config()

const forks = {
  [SupportedChainId.MAINNET]: {
    url: `${process.env.JSON_RPC_PROVIDER}`,
    blockNumber: 17023328,
    httpHeaders: {},
  },
  [SupportedChainId.POLYGON]: {
    url: `${process.env.POLYGON_JSON_RPC_PROVIDER}`,
    blockNumber: 43600000,
    httpHeaders: {},
  },
}

module.exports = {
  forks,
  networks: {
    hardhat: {
      chainId: SupportedChainId.MAINNET,
      forking: forks[SupportedChainId.MAINNET],
      accounts: {
        count: 2,
      },
    },
  },
}
