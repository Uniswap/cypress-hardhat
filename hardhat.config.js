const { ChainId } = require('@uniswap/sdk-core')

/* eslint-env node */
require('dotenv').config()

const forks = {
  [ChainId.MAINNET]: {
    url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
    blockNumber: 17023328,
    httpHeaders: { Origin: 'localhost:3000' },
  },
  [ChainId.POLYGON]: {
    url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
    blockNumber: 43600000,
    httpHeaders: { Origin: 'localhost:3000' },
  },
}

module.exports = {
  forks,
  networks: {
    hardhat: {
      chainId: ChainId.MAINNET,
      forking: forks[ChainId.MAINNET],
      accounts: {
        count: 2,
      },
    },
  },
}
