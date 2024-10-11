import { StatusCodes } from '@ledgerhq/errors'

import { assert } from '@/archmage/errors'

import handleCmdRequest from './cmd'
import { EthRequestHandler } from './eth'
import {
  App,
  BaseLedgerBlePeripheral,
  Request,
  RequestHandler,
  bufferStatusCode
} from './peripheral'

export * from './peripheral'
export * from './eth'

export class LedgerBlePeripheral extends BaseLedgerBlePeripheral {
  private static _instance: LedgerBlePeripheral

  static instance() {
    if (!this._instance) {
      this._instance = new LedgerBlePeripheral()
    }
    return this._instance
  }

  private handlers: Map<App, RequestHandler>

  private constructor() {
    super()

    this.handlers = new Map<App, RequestHandler>([
      [App.Ethereum, new EthRequestHandler(this)]
    ])
  }

  override async handleRequest(): Promise<void> {
    const apdu = await this.receive()

    try {
      const handled = await handleCmdRequest(this, apdu, () => {
        this.handlers.get(App.Ethereum)?.clean()
      })
      if (handled) {
        return
      }

      if (this.app) {
        const handler = this.handlers.get(this.app)
        if (handler) {
          return await handler?.handleRequest(apdu)
        }
      }
    } catch (err) {
      if (err instanceof RangeError) {
        return await this.send(bufferStatusCode(StatusCodes.INCORRECT_DATA))
      } else if (
        err instanceof TypeError &&
        err.toString().includes('Cannot read properties of undefined')
      ) {
        return await this.send(bufferStatusCode(StatusCodes.INCORRECT_DATA))
      }
    }

    return await this.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
  }

  async respond(req: Request, rep: Record<string, any>) {
    const handler = this.handlers.get(req.app)
    assert(handler, 'handler not found')
    return await handler.respond(req, rep)
  }
}
