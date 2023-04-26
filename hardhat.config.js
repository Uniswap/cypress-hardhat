/* eslint-env node */
require('dotenv').config()

const mainnetFork = {
  url: `${process.env.JSON_RPC_PROVIDER}`,
  blockNumber: 17023328,
}

module.exports = {
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 12000, // average mainnet block time
      },
      chainId: 1,
      forking: mainnetFork,
      accounts: {
        count: 2,
      },
    },
  },
}
