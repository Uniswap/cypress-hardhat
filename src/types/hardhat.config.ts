/* eslint-disable import/no-unused-modules */
import 'hardhat/types/config'

declare module 'hardhat/types/config' {
  export interface HardhatUserConfig {
    /**
     * Forking configurations per chain.
     * This is used when resolving calls to wallet_switchEthereumChain.
     **/
    forks?: Record<number, Omit<HardhatNetworkForkingUserConfig, 'enabled'>>
  }

  export interface HardhatConfig {
    forks: Record<number, Omit<HardhatNetworkForkingConfig, 'enabled'>>
  }
}
