import type { TokenInfo } from '@ledgerhq/hw-app-eth/lib/services/ledger/erc20'
import { toHex } from 'viem'

import { assert } from '@/archmage/errors'

export class TokenInfoDecoder {
  receiveTokenInfo(data: Buffer) {
    let j = 0
    const tickerLength = data.readUInt8(j)
    j += 1
    const ticker = data.subarray(j, j + tickerLength).toString('ascii')
    j += tickerLength
    const contractAddress = toHex(data.subarray(j, j + 20))
    j += 20
    const decimals = data.readUInt32BE(j)
    j += 4
    const chainId = data.readUInt32BE(j)
    j += 4
    const signature = data.subarray(j)

    const info = {
      contractAddress,
      ticker,
      decimals,
      chainId,
      signature,
      data
    }

    this.list.push(info)
    this.map[String(chainId) + ':' + contractAddress] = info

    const deviceTokenIndex = this.list.length - 1 // position
    assert(deviceTokenIndex < 256, 'APDU invalid device token index')
    return deviceTokenIndex
  }

  provider() {
    return new TokenInfoProvider(this.map)
  }

  clear() {
    this.list = []
    this.map = {}
  }

  list: TokenInfo[] = []
  map: Record<string, TokenInfo> = {}
}

export class TokenInfoProvider {
  constructor(private readonly map: Record<string, TokenInfo> = {}) {}

  byContractAndChainId(contractAddress: string, chainId: number): TokenInfo | undefined {
    return this.map[String(chainId) + ':' + contractAddress]
  }
}
