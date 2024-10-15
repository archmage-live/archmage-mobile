import { Hex, toHex } from 'viem'

import { assert } from '@/archmage/errors'

import { RequestChecker, readHdPath } from '../util'

export type SignPersonalMsgRequest = {
  path: string
  message: Hex
}

export class PersonalSignDecoder extends RequestChecker {
  receiveMessage(chunk: Buffer, isFirstChunk: boolean) {
    this.check(isFirstChunk)

    if (isFirstChunk) {
      const [pathLen, path] = readHdPath(chunk)
      this.path = path
      this.rawDataLen = chunk.readUInt32BE(pathLen)
      this.rawData = chunk.subarray(pathLen + 4)
    } else {
      this.rawData = Buffer.concat([this.rawData, chunk])
    }

    if (this.rawData.length === this.rawDataLen) {
      const args: SignPersonalMsgRequest = { path: this.path, message: toHex(this.rawData) }

      this.clean()

      return args
    } else {
      assert(this.rawData.length < this.rawDataLen, 'APDU invalid message length')
      // Continue to receive message chunks.
    }
  }

  override clean() {
    super.clean()
    this.path = ''
    this.rawDataLen = 0
    this.rawData = Buffer.alloc(0)
  }

  private path = ''
  private rawDataLen = 0
  private rawData = Buffer.alloc(0)
}
