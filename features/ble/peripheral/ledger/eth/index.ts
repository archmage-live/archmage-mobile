import { StatusCodes } from '@ledgerhq/errors'
import { getBytes, randomBytes, zeroPadValue } from 'ethers'
import { Hex, getTransactionType, toBytes, toHex } from 'viem'

import { assert } from '@/archmage/errors'

import {
  APDU,
  App,
  AppVersion,
  Constant,
  Request,
  RequestHandler,
  bufferStatusCode
} from '../peripheral'
import { RequestTimer, readHdPath } from '../util'
import { DomainNameDecoder } from './domainName'
import { Eip712Decoder, SignEIP712HashedMsgRequest, SignEIP712MsgRequest } from './eip712'
import { TokenInfoDecoder } from './erc20'
import { NftInfoDecoder } from './nft'
import { PersonalSignDecoder } from './personalSign'
import { SignTransactionRequest, TransactionDecoder } from './tx'

export class EthRequestHandler extends RequestHandler {
  override async handleRequest(apdu: APDU) {
    const peripheral = this.peripheral

    const [cla, ins, p1, p2, data] = apdu

    if (cla === Constant.CLA_E0) {
      switch (ins) {
        case Constant.INS_02: {
          // getAddress
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
          return this.request(RequestType.GetAddress, args)
        }
        case Constant.INS_04: {
          // signTransaction
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00 || p1 === 0x80, 'APDU invalid p1')
          assert(p2 === Constant.P2_00, 'APDU invalid p2')
          let args = this.txDecoder.receiveTransaction(data, p1 === Constant.P1_00)
          if (!args) {
            return await peripheral.send(bufferStatusCode(StatusCodes.OK))
          } else {
            args = {
              ...args,
              tokenInfoProvider: this.tokenInfoDecoder.provider(),
              nftInfoProvider: this.nftInfoDecoder.provider(),
              domainNameProvider: this.domainNameDecoder.provider()
            }
            return this.request(RequestType.SignTransaction, args)
          }
        }
        case Constant.INS_06: {
          // getAppConfiguration
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          // https://github.com/LedgerHQ/app-ethereum/blob/master/src_features/getAppConfiguration/cmd_getAppConfiguration.c
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
          // signPersonalMessage
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00 || p1 === 0x80, 'APDU invalid p1')
          assert(p2 === Constant.P1_00, 'APDU invalid p2')
          const args = this.personalSignDecoder.receiveMessage(data, p1 === Constant.P1_00)
          if (!args) {
            return await peripheral.send(bufferStatusCode(StatusCodes.OK))
          } else {
            return this.request(RequestType.SignPersonalMessage, args)
          }
        }

        case Constant.INS_0C: {
          // signEIP712HashedMessage / signEIP712Message
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00, 'APDU invalid p1')
          const [pathLen, path] = readHdPath(data)
          if (data.length > pathLen) {
            assert(p2 === Constant.P2_00, 'APDU invalid p2')
            const domainSeparator = toHex(data.subarray(pathLen, pathLen + 32))
            const hashStructMessage = toHex(data.subarray(pathLen + 32, pathLen + 64))
            const args: SignEIP712HashedMsgRequest = { path, domainSeparator, hashStructMessage }
            return this.request(RequestType.SignEIP712HashedMessage, args)
          } else {
            assert(p2 === Constant.P2_00 || p2 === 0x01, 'APDU invalid p2')

            const typedData = this.eip712Decoder.decode()

            const args: SignEIP712MsgRequest = {
              path,
              typedData,
              tokenInfoProvider: this.tokenInfoDecoder.provider(),
              legacy: p2 === Constant.P2_00
            }
            return this.request(RequestType.SignEIP712Message, args)
          }
        }
        case Constant.INS_1A: {
          // Receive `types` of EIP-712 typed data.
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00, 'APDU invalid p1')
          if (p2 === Constant.P2_00) {
            this.eip712Decoder.receiveTypeName(data)
          } else {
            assert(p2 === 0xff, 'APDU invalid p2')
            this.eip712Decoder.receiveType(data)
          }
          return await peripheral.send(bufferStatusCode(StatusCodes.OK))
        }
        case Constant.INS_1C: {
          // Receive `domain` or `message` of EIP-712 typed data.
          assert(data, 'APDU empty data')
          if (p1 === Constant.P1_00 && p2 === Constant.P2_00) {
            this.eip712Decoder.receiveValue(data, 'root')
          } else if (p1 === Constant.P1_00 && p2 === 0x0f) {
            this.eip712Decoder.receiveValue(data, 'array')
          } else if (p1 === 0x01 && p2 === 0xff) {
            this.eip712Decoder.receiveValue(data, 'fieldPartial')
          } else if (p1 === Constant.P1_00 && p2 === 0xff) {
            this.eip712Decoder.receiveValue(data, 'fieldComplete')
          } else {
            return await peripheral.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
          }
          return await peripheral.send(bufferStatusCode(StatusCodes.OK))
        }
        case Constant.INS_1E: {
          // Receive EIP-712 filters.
          assert(p1 === Constant.P1_00, 'APDU invalid p1')
          switch (p2) {
            case Constant.P2_00: {
              this.eip712Decoder.receiveFilterActivate()
              return await peripheral.send(bufferStatusCode(StatusCodes.OK))
            }
            case 0x0f: {
              assert(data, 'APDU empty data')
              this.eip712Decoder.receiveFilterContractName(data)
              return await peripheral.send(bufferStatusCode(StatusCodes.OK))
            }
            default: {
              assert(data, 'APDU empty data')
              let format: 'raw' | 'datetime' | 'token' | 'amount'
              switch (p2) {
                case 0xff:
                  format = 'raw'
                  break
                case 0xfc:
                  format = 'datetime'
                  break
                case 0xfd:
                  format = 'token'
                  break
                case 0xfe:
                  format = 'amount'
                  break
                default:
                  assert(false, 'APDU invalid p2')
              }
              this.eip712Decoder.receiveFilterShowField(data, format)
              return await peripheral.send(bufferStatusCode(StatusCodes.OK))
            }
          }
        }
        case Constant.INS_20: {
          // getChallenge
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          const challenge = randomBytes(4)
          return await peripheral.send(
            Buffer.concat([
              challenge,
              bufferStatusCode(StatusCodes.OK)])
          )
        }
        case Constant.INS_0A: {
          // provideERC20TokenInformation
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          const deviceTokenIndex = this.tokenInfoDecoder.receiveTokenInfo(data)
          return await peripheral.send(
            Buffer.concat([
              Buffer.from([deviceTokenIndex]),
              bufferStatusCode(StatusCodes.OK)])
          )
        }
        case Constant.INS_12:
        // fall through
        case Constant.INS_16: {
          // setExternalPlugin / setPlugin
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          // 0x6984: the plugin requested is not installed on the device
          return await peripheral.send(bufferStatusCode(0x6984))
        }
        case Constant.INS_14: {
          // provideNFTInformation
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          this.nftInfoDecoder.receiveNftInfo(data)
          return await peripheral.send(bufferStatusCode(StatusCodes.OK))
        }
        case Constant.INS_22: {
          // provideDomainName
          assert(data, 'APDU empty data')
          assert(p1 === Constant.P1_00 || p1 === 0x01, 'APDU invalid p1')
          assert(p2 === Constant.P2_00, 'APDU invalid p2')
          this.domainNameDecoder.receiveDomainName(data, p1 === 0x01)
          return await peripheral.send(bufferStatusCode(StatusCodes.OK))
        }
      }
    }

    return await peripheral.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
  }

  request(type: RequestType, args: Record<string, any>) {
    const req: Request = {
      app: App.Ethereum,
      type,
      args: {
        ...args,
        requestId: ++this.requestId
      }
    }
  }

  override async respond(req: Request, rep: Record<string, any>) {
    assert(req.args['requestId'] === this.requestId, 'invalid requestId')

    const peripheral = this.peripheral

    switch (req.type) {
      case RequestType.GetAddress: {
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

      case RequestType.SignTransaction: {
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
      case RequestType.SignPersonalMessage:
      case RequestType.SignEIP712HashedMessage:
      case RequestType.SignEIP712Message: {
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
    this.domainNameDecoder.clean()
    this.txDecoder.clean()
    this.personalSignDecoder.clean()
    this.eip712Decoder.clean()
  }

  clear() {
    this.tokenInfoDecoder.clear()
    this.nftInfoDecoder.clear()
    this.domainNameDecoder.clear()
  }

  private timer = new RequestTimer()
  private tokenInfoDecoder = new TokenInfoDecoder()
  private nftInfoDecoder = new NftInfoDecoder()
  private domainNameDecoder = new DomainNameDecoder(this.timer)
  private txDecoder = new TransactionDecoder(this.timer)
  private personalSignDecoder = new PersonalSignDecoder(this.timer)
  private eip712Decoder = new Eip712Decoder(this.timer)

  private requestId = 0
}

export enum RequestType {
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

export type Signature = {
  r: Hex
  s: Hex
  v: 27 | 28 | 27n | 28n
  yParity: 0 | 1
}
