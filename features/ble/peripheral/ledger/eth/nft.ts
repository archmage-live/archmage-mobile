type NftInfo = {
  collectionName: string
  contractAddress: string
}

export class NftInfoDecoder {
  receiveNftInfo(data: Buffer) {
    // Ignore:
    // data[0]: type
    // data[1]: version
    let offset = 2
    const collectionNameLen = data[offset]
    offset += 1
    const collectionName = data.subarray(offset, offset + collectionNameLen).toString()
    offset += collectionNameLen
    const contractAddress = data.subarray(offset, offset + 20).toString('hex')
    offset += 20
    const chainId = Number(data.readBigUInt64BE(offset))

    const info = {
      collectionName,
      contractAddress
    }
    this.list.push(info)
    this.map[String(chainId) + ':' + contractAddress] = info
  }

  provider() {
    return new NftInfoProvider(this.map)
  }

  clear() {
    this.list = []
    this.map = {}
  }

  list: NftInfo[] = []
  map: Record<string, NftInfo> = {}
}

export class NftInfoProvider {
  constructor(private readonly map: Record<string, NftInfo> = {}) {}

  byContractAndChainId(contractAddress: string, chainId: number) {
    return this.map[String(chainId) + ':' + contractAddress]
  }
}
