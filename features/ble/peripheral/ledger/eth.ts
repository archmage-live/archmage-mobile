import { StatusCodes } from '@ledgerhq/errors'
import { getBytes, randomBytes, zeroPadValue } from 'ethers'
import { parseTransaction, toBytes, toHex } from 'viem'

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
          const pathsLen = data.readUInt8()
          const paths: number[] = []
          for (let i = 0; i < pathsLen; i++) {
            paths.push(data.readUInt32BE(1 + 4 * i))
          }
          let chainId: string | undefined
          if (data.length > 1 + 4 * pathsLen) {
            chainId = '0x' + data.readBigUInt64BE(1 + 4 * pathsLen).toString(16)
          }
          const args: GetAddressRequest = { shouldDisplay, requestChaincode, chainId }
          return this.request(EthRequestType.GetAddress, args)
        }
        case Constant.INS_04: {
          assert(data, 'APDU empty data')
          assert(p2 === Constant.P1_00, 'APDU invalid p2')
          if (p1 === Constant.P1_00) {
            const pathsLen = data.readUInt8()
            const paths: number[] = []
            for (let i = 0; i < pathsLen; i++) {
              paths.push(data.readUInt32BE(1 + 4 * i))
            }
            this.rawTx = data.subarray(1 + 4 * pathsLen)
          } else {
            assert(p1 === 0x80, 'APDU invalid p1')
            this.rawTx = Buffer.concat([this.rawTx, data])
          }
          const rawTx = toHex(this.rawTx)
          try {
            const tx = parseTransaction(rawTx)
            // If parsing succeeds, rawTx chunks have been received completely.
            const args: SignTransactionRequest = { rawTx, tx }
            return this.request(EthRequestType.SignTransaction, args)
          } catch {
            // If parsing fails, continue to receive rawTx chunks.
            return await peripheral.send(bufferStatusCode(StatusCodes.OK))
          }
        }
        case Constant.INS_06: {
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          return this.request(EthRequestType.GetAppConfiguration)
        }
        case Constant.INS_20: {
          assert(p1 === Constant.P1_00 && p2 === Constant.P2_00, 'APDU invalid p1/p2')
          return this.request(EthRequestType.GetChallenge)
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
        const r = rep as SignTransactionResponse
        const { tx } = req.args as SignTransactionRequest
        const chainId = tx.chainId || 1
        const chainIdBuf = toBytes(chainId)
        const chainIdTruncatedBuf = Buffer.alloc(4)
        if (chainIdBuf.length > 4) {
          chainIdTruncatedBuf.set(chainIdBuf)
        } else {
          chainIdTruncatedBuf.set(chainIdBuf, 4 - chainIdBuf.length)
        }
        const chainIdTruncated = chainIdTruncatedBuf.readUInt32BE()
        let firstByte
        if (BigInt(chainId) * 2n + 35n + 1n > 255) {
          const oneByteChainId = (chainIdTruncated * 2 + 35) % 256
          let eccParity
          if (tx.type !== 'legacy') {
            // For EIP2930 and EIP1559 tx, v is simply the parity.
            eccParity = BigInt(r.v) === 0n ? 1 : 0
          } else {
            // Legacy type transaction with a big chain ID
            eccParity = Number(BigInt(r.v) - (BigInt(chainId) * 2n + 35n))
          }
          firstByte = eccParity + oneByteChainId // TODO
        } else {
          firstByte = Number(r.v)
        }
        return await peripheral.send(
          Buffer.concat([
            Buffer.from([firstByte]),
            toBytes(r.r),
            toBytes(r.s),
            bufferStatusCode(StatusCodes.OK)])
        )
      }
      case EthRequestType.GetAppConfiguration: {
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
      case EthRequestType.GetChallenge: {
        const challenge = randomBytes(4)
        return await peripheral.send(
          Buffer.concat([
            challenge,
            bufferStatusCode(StatusCodes.OK)])
        )
      }
    }
  }

  private rawTx = Buffer.alloc(0)
}

export enum EthRequestType {
  GetAddress,
  SignTransaction,
  GetAppConfiguration,
  GetChallenge
}

export type GetAddressRequest = {
  shouldDisplay: boolean
  requestChaincode: boolean
  chainId?: string
}

export type GetAddressResponse = {
  publicKey: string
  address: string
  chainCode?: string
}

export type SignTransactionRequest = {
  rawTx: string
  tx: ReturnType<typeof parseTransaction>
}

export type SignTransactionResponse = {
  v: string
  r: string
  s: string
}
