import { JsonRpcProvider, TransactionRequest, TransactionResponse } from '@ethersproject/providers'
import { VoidSigner } from 'ethers/lib/ethers'
import { resolveProperties } from 'ethers/lib/utils'

export class ImpersonatedSigner extends VoidSigner {
  override readonly provider!: JsonRpcProvider

  constructor(address: string, provider: JsonRpcProvider) {
    super(address, provider)
  }

  async sendTransaction(transaction: TransactionRequest): Promise<TransactionResponse> {
    const tx = await resolveProperties(transaction)
    tx.from = this.address
    const hexTx = JsonRpcProvider.hexlifyTransaction(tx, { from: true })
    const hash = await this.provider.send('eth_sendTransaction', [hexTx])
    return this.provider.getTransaction(hash)
  }
}
