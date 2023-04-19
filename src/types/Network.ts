import { ExternallyOwnedAccount } from '@ethersproject/abstract-signer'

export interface Network {
  /** The network's JSON-RPC address. */
  url: string
  /** The chainId of the network. */
  chainId: number
  /** The test accounts. */
  accounts: ExternallyOwnedAccount[]
}
