const { SupportedChainId } = require('@uniswap/sdk-core')

/* eslint-env node */
require('dotenv').config()

const forks = {
  [SupportedChainId.MAINNET]: {
    url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
    blockNumber: 17023328,
    httpHeaders: { Origin: 'localhost:3000' },
  },
  [SupportedChainId.POLYGON]: {
    url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
    blockNumber: 43600000,
    httpHeaders: { Origin: 'localhost:3000' },
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
