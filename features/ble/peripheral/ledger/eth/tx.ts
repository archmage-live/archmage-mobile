import { Hex, parseTransaction, toHex } from 'viem'

import { RequestChecker, readHdPath } from '../util'
import { DomainNameProvider } from './domainName'
import { TokenInfoProvider } from './erc20'
import { NftInfoProvider } from './nft'

export type SignTransactionRequest = {
  path: string
  rawTx: Hex
  tx: ReturnType<typeof parseTransaction>
  tokenInfoProvider: TokenInfoProvider
  nftInfoProvider: NftInfoProvider
  domainNameProvider: DomainNameProvider
}

export class TransactionDecoder extends RequestChecker {
  receiveTransaction(chunk: Buffer, isFirstChunk: boolean) {
    this.check(isFirstChunk)

    if (isFirstChunk) {
      const [pathLen, path] = readHdPath(chunk)
      this.path = path
      this.rawData = chunk.subarray(pathLen)
    } else {
      this.rawData = Buffer.concat([this.rawData, chunk])
    }

    try {
      const rawTx = toHex(this.rawData)
      const tx = parseTransaction(rawTx)

      // If parsing succeeds, rawTx chunks have been received completely.
      const args: SignTransactionRequest = { path: this.path, rawTx, tx } as any

      this.clean()

      return args
    } catch {
      // If parsing fails, continue to receive rawTx chunks.
    }
  }

  override clean() {
    super.clean()
    this.path = ''
    this.rawData = Buffer.alloc(0)
  }

  private path = ''
  private rawData = Buffer.alloc(0)
}
