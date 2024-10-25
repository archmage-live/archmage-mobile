import { tlvParser } from '@ledgerhq/domain-service'

import { assert } from '@/archmage/errors'

import { RequestChecker } from '../util'

export class DomainNameDecoder extends RequestChecker {
  forward: Record<string, string> = {} // name -> address
  reverse: Record<string, string> = {} // address -> name

  receiveDomainName(chunk: Buffer, isFirstChunk: boolean) {
    this.check(isFirstChunk)

    if (isFirstChunk) {
      this.remainBytes = chunk.readUInt16BE(0)
      this.chunks.push(chunk.subarray(2))
      this.remainBytes -= chunk.length - 2
    } else {
      this.chunks.push(chunk)
      this.remainBytes -= chunk.length
    }

    assert(this.remainBytes >= 0, 'invalid chunk size')
    if (this.remainBytes > 0) {
      return
    }

    const data = Buffer.concat(this.chunks)
    const parsed = tlvParser(data.toString('hex'))
    let name, address
    for (const tlv of parsed) {
      if (tlv.T === 'TRUSTED_NAME') {
        name = tlv.V as string
      } else if (tlv.T === 'ADDRESS') {
        address = tlv.V as string
      }
    }
    if (name && address) {
      this.forward[name] = address
      this.reverse[address] = name
    }

    this.clean()
  }

  provider() {
    return new DomainNameProvider(this.forward, this.reverse)
  }

  clean() {
    super.clean()
    this.remainBytes = 0
    this.chunks = []
  }

  clear() {
    this.forward = {}
    this.reverse = {}
  }

  private remainBytes = 0
  private chunks: Buffer[] = []
}

export class DomainNameProvider {
  constructor(
    public readonly forward: Record<string, string>, // name -> address
    public readonly reverse: Record<string, string> // address -> name
  ) {}
}
