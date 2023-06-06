import { ExternallyOwnedAccount } from '@ethersproject/abstract-signer'

export interface Network {
  /** The network's JSON-RPC address. */
  url: string
  /** Accounts configured via hardhat's {@link https://hardhat.org/hardhat-network/reference/#accounts}. */
  accounts: ExternallyOwnedAccount[]
}
