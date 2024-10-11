import { Slip10RawIndex, pathToString } from '@cosmjs/crypto'
import { StatusCodes } from '@ledgerhq/errors'
import type { TypedDataParameter } from 'abitype'
import { getBytes, randomBytes, zeroPadValue } from 'ethers'
import {
  Hex,
  TypedData,
  fromBytes,
  getTransactionType,
  hashTypedData,
  parseTransaction,
  toBytes,
  toHex
} from 'viem'

import { assert } from '@/archmage/errors'

import {
  APDU,
  App,
  AppVersion,
  Constant,
  Request,
  RequestHandler,
  bufferStatusCode
} from './peripheral'

export class EthRequestHandler extends RequestHandler {
  override async handleRequest(apdu: APDU) {
    const peripheral = this.peripheral

    const [cla, ins, p1, p2, data] = apdu

    if (cla === Constant.CLA_E0) {
      switch (ins) {
        case Constant.INS_02: {
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00 || p1 === 0x01, 'APDU invalid p1')
          assert(p2 === Constant.P2_00 || p2 === 0x01, 'APDU invalid p2')
          const shouldDisplay = p1 === 0x01
          const requestChaincode = p2 === 0x01
          const [pathLen, path] = readHdPath(data)
          let chainId: string | undefined
          if (data.length > pathLen) {
            chainId = '0x' + data.readBigUInt64BE(pathLen).toString(16)
          }
          const args: GetAddressRequest = { path, shouldDisplay, requestChaincode, chainId }
          return this.request(EthRequestType.GetAddress, args)
        }
        case Constant.INS_04: {
          assert(data, 'APDU empty data')
          assert(p2 === Constant.P1_00, 'APDU invalid p2')
          if (p1 === Constant.P1_00) {
            const [pathLen, path] = readHdPath(data)
            this.path = path
            this.rawData = data.subarray(pathLen)
          } else {
            assert(p1 === 0x80, 'APDU invalid p1')
            this.rawData = Buffer.concat([this.rawData, data])
          }
          try {
            const rawTx = toHex(this.rawData)
            const tx = parseTransaction(rawTx)

            // If parsing succeeds, rawTx chunks have been received completely.
            const args: SignTransactionRequest = { path: this.path, rawTx, tx }
            this.path = ''
            this.rawData = Buffer.alloc(0)
            return this.request(EthRequestType.SignTransaction, args)
          } catch {
            // If parsing fails, continue to receive rawTx chunks.
            // TODO: timeout handling
            return await peripheral.send(bufferStatusCode(StatusCodes.OK))
          }
        }
        case Constant.INS_06: {
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          const arbitraryDataEnabled = 0x01
          const erc20ProvisioningNecessary = 0x02
          const version = AppVersion.Ethereum.split('.').map(parseInt)
          return await peripheral.send(
            Buffer.concat([
              Buffer.from([
                arbitraryDataEnabled | erc20ProvisioningNecessary,
                version[0],
                version[1],
                version[2]
              ]),
              bufferStatusCode(StatusCodes.OK)
            ])
          )
        }
        case Constant.INS_08: {
          assert(data, 'APDU empty data')
          assert(p2 === Constant.P1_00, 'APDU invalid p2')
          if (p1 === Constant.P1_00) {
            const [pathLen, path] = readHdPath(data)
            this.path = path
            this.rawDataLen = data.readUInt32BE(pathLen)
            this.rawData = data.subarray(pathLen + 1)
          } else {
            assert(p1 === 0x80, 'APDU invalid p1')
            this.rawData = Buffer.concat([this.rawData, data])
          }
          if (this.rawData.length === this.rawDataLen) {
            const args: SignPersonalMsgRequest = { path: this.path, message: toHex(this.rawData) }
            this.path = ''
            this.rawDataLen = 0
            this.rawData = Buffer.alloc(0)
            return this.request(EthRequestType.SignPersonalMessage, args)
          } else {
            assert(this.rawData.length < this.rawDataLen, 'APDU invalid message length')
            // Continue to receive message chunks.
            // TODO: timeout handling
            return await peripheral.send(bufferStatusCode(StatusCodes.OK))
          }
        }
        case Constant.INS_0C: {
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          const [pathLen, path] = readHdPath(data)
          const domainSeparator = toHex(data.subarray(pathLen, pathLen + 32))
          const hashStructMessage = toHex(data.subarray(pathLen + 32, pathLen + 64))
          const args: SignEIP712HashedMsgRequest = { path, domainSeparator, hashStructMessage }
          return this.request(EthRequestType.SignEIP712HashedMessage, args)
        }
        case Constant.INS_1A: {
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00, 'APDU invalid p1')
          if (p2 === Constant.P2_00) {
            const structTypeName = data.toString()
            this.typedData[structTypeName] = []
            this.typedDataName = structTypeName
          } else {
            assert(p2 === 0xff, 'APDU invalid p2')

            const getType = (key: number, size: number = 0, name: string = '') => {
              switch (key) {
                case 0:
                  assert(name, 'invalid custom type name')
                  return name
                case 1:
                  assert(size * 8 >= 8 && size * 8 <= 256, 'invalid int* type')
                  return `int${size * 8}`
                case 2:
                  assert(size * 8 >= 8 && size * 8 <= 256, 'invalid uint* type')
                  return `unt${size * 8}`
                case 3:
                  return 'address'
                case 4:
                  return 'bool'
                case 5:
                  return 'string'
                case 6:
                  assert(size >= 1 && size <= 32, 'invalid bytes* type')
                  return `bytes${size}`
                case 7:
                  return 'bytes'
                default:
                  throw new Error('invalid type key')
              }
            }

            let offset = 0
            const typeDescData = data[offset].toString(2).padStart(8, '0')
            const isTypeArray = typeDescData[0] === '1'
            const hasTypeSize = typeDescData[1] === '1'
            const typeKey = parseInt(typeDescData.slice(4), 2)
            offset += 1

            let customTypeName
            if (typeKey === 0) {
              const customTypeNameLen = data[offset]
              offset += 1
              customTypeName = data.subarray(offset, offset + customTypeNameLen).toString()
              offset += customTypeNameLen
            }

            let typeSize
            if (hasTypeSize) {
              typeSize = data[offset]
              offset += 1
            }

            const type = getType(typeKey, typeSize, customTypeName)

            if (isTypeArray) {
              const arraySizesNum = data[offset]
              offset += 1

              const arraySizes = []
              for (let arraySize = 0; arraySize < arraySizesNum; arraySize++) {
                const arrayType = data[offset]
                offset += 1

                if (arrayType === 1) {
                  // fixed array
                  arraySizes.push(data[offset])
                  offset += 1
                } else {
                  // dynamic array
                  assert(arrayType === 0, 'invalid array type')
                  arraySizes.push(null)
                }
              }
            }

            const nameLen = data[offset]
            offset += 1
            const name = data.subarray(offset, offset + nameLen).toString()
            offset += nameLen

            this.typedData[this.typedDataName].push({ name, type })
          }
          return await peripheral.send(bufferStatusCode(StatusCodes.OK))
        }
        case Constant.INS_20: {
          // GetChallenge
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          const challenge = randomBytes(4)
          return await peripheral.send(
            Buffer.concat([
              challenge,
              bufferStatusCode(StatusCodes.OK)])
          )
        }
      }
    } else if (cla === Constant.CLA_E0) {
    }

    return await peripheral.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
  }

  request(type: EthRequestType, args?: Record<string, any>) {
    const req: Request = {
      app: App.Ethereum,
      type,
      args
    }
  }

  override async respond(req: Request, rep: Record<string, any>) {
    const peripheral = this.peripheral

    switch (req.type) {
      case EthRequestType.GetAddress: {
        const r = rep as GetAddressResponse
        const publicKey = getBytes(r.publicKey)
        const address = Buffer.from(r.address, 'ascii')
        const chaincode = (req.args as GetAddressRequest).requestChaincode
          ? getBytes(zeroPadValue(r.chainCode!, 32))
          : Buffer.alloc(0)
        return await peripheral.send(
          Buffer.concat([
            Buffer.from([publicKey.length]),
            publicKey,
            Buffer.from([address.length]),
            address,
            chaincode,
            bufferStatusCode(StatusCodes.OK)])
        )
      }

      case EthRequestType.SignTransaction: {
        const { tx } = req.args as SignTransactionRequest
        const r = rep as Signature
        assert(
          (r.yParity === 0 || r.yParity === 1) && (Number(r.v) === 27 || Number(r.v) === 28),
          'Invalid v/yParity'
        )

        const type = getTransactionType(tx)

        // Since viem treats chainId as number type, we do not consider the BigInt type.
        // It is reasonable in actual scenarios.
        const chainId = tx.chainId || 0 // Legacy tx may lack chainId

        const chainIdBuf = toBytes(chainId)
        const chainIdTruncatedBuf = Buffer.alloc(4)
        if (chainIdBuf.length > 4) {
          chainIdTruncatedBuf.set(chainIdBuf)
        } else {
          chainIdTruncatedBuf.set(chainIdBuf, 4 - chainIdBuf.length)
        }
        const chainIdTruncated = chainIdTruncatedBuf.readUInt32BE()

        // Wierd, but the Ledger hw-app-eth way.
        let firstByte
        if (chainId * 2 + 35 + 1 > 255) {
          const oneByteChainId = (chainIdTruncated * 2 + 35) % 256
          let eccParity: 0 | 1
          if (type === 'legacy') {
            eccParity = r.yParity
          } else {
            eccParity = r.yParity === 0 ? 1 : 0 // NOTE: the Ledger hw-app-eth reverse the parity
          }
          firstByte =
            eccParity + oneByteChainId <= 255
              ? eccParity + oneByteChainId
              : oneByteChainId - eccParity
        } else {
          // EIP-155
          if (type === 'legacy' && chainId) {
            firstByte = r.yParity + chainId * 2 + 35
          } else {
            firstByte = Number(r.v)
          }
        }

        return await peripheral.send(
          Buffer.concat([
            Buffer.from([firstByte]),
            toBytes(r.r),
            toBytes(r.s),
            bufferStatusCode(StatusCodes.OK)])
        )
      }
      case EthRequestType.SignPersonalMessage:
      case EthRequestType.SignEIP712HashedMessage:
      case EthRequestType.SignEIP712Message: {
        const r = rep as Signature
        return await peripheral.send(
          Buffer.concat([
            Buffer.from([Number(r.v)]),
            toBytes(r.r),
            toBytes(r.s),
            bufferStatusCode(StatusCodes.OK)])
        )
      }
    }
  }

  override clean() {
    this.path = ''
    this.rawDataLen = 0
    this.rawData = Buffer.alloc(0)
    this.typedData = {}
    this.typedDataName = ''
  }

  private path = ''
  private rawDataLen = 0
  private rawData = Buffer.alloc(0)

  private typedData: Record<string, TypedDataParameter[]> = {}
  private typedDataName = ''
}

export enum EthRequestType {
  GetAddress,
  SignTransaction,
  SignPersonalMessage,
  SignEIP712HashedMessage,
  SignEIP712Message
}

export type GetAddressRequest = {
  path: string
  shouldDisplay: boolean
  requestChaincode: boolean
  chainId?: string
}

export type GetAddressResponse = {
  publicKey: Hex
  address: Hex
  chainCode?: string
}

export type SignTransactionRequest = {
  path: string
  rawTx: Hex
  tx: ReturnType<typeof parseTransaction>
}

export type Signature = {
  r: Hex
  s: Hex
  v: 27 | 28 | 27n | 28n
  yParity: 0 | 1
}

export type SignPersonalMsgRequest = {
  path: string
  message: Hex
}

export type SignEIP712HashedMsgRequest = {
  path: string
  domainSeparator: Hex
  hashStructMessage: Hex
}

export type SignEIP712MsgRequest = {
  path: string
  eip712Message: Eip712Message
  legacy: boolean // ignored
}

type Eip712Message = Parameters<typeof hashTypedData>[0]
type Eip712MessageTypes = Eip712Message['types']

function readHdPath(data: Buffer): [number, string] {
  const pathLen = data.readUInt8()
  const path: Slip10RawIndex[] = []
  for (let i = 0; i < pathLen; i++) {
    path.push(new Slip10RawIndex(data.readUInt32BE(1 + 4 * i)))
  }
  return [1 + 4 * pathLen, pathToString(path)]
}
