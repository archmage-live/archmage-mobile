import { DeviceModelId, getDeviceModel } from '@ledgerhq/devices'
import { receiveAPDU } from '@ledgerhq/devices/lib/ble/receiveAPDU'
import { sendAPDU } from '@ledgerhq/devices/lib/ble/sendAPDU'
import { StatusCodes, TransportError } from '@ledgerhq/errors'
import bleModule, {
  PERMISSION_READ,
  PERMISSION_WRITE,
  PROPERTY_INDICATE,
  PROPERTY_NOTIFY,
  PROPERTY_WRITE,
  PROPERTY_WRITE_NO_RESPONSE
} from 'expo-ble-peripheral'
import { filter, firstValueFrom, map, merge } from 'rxjs'

import { logger } from '@/archmage/logger/logger'
import { sleep } from '@/archmage/time/timing'

import { BlePeripheral } from '../peripheral'

export class LedgerBlePeripheral {
  private static _instance: LedgerBlePeripheral

  static instance() {
    if (!this._instance) {
      this._instance = new LedgerBlePeripheral()
    }
    return this._instance
  }

  private device = getDeviceModel(DeviceModelId.nanoX)
  private spec = this.device.bluetoothSpec![0]

  private mtuSize = 20

  private isStarted = false

  private app?: App

  private constructor() {}

  async start() {
    if (this.isStarted) {
      return
    }

    this.isStarted = true

    const { serviceUuid, writeUuid, writeCmdUuid, notifyUuid } = this.spec

    bleModule.addService(serviceUuid, true)

    bleModule.addCharacteristic(
      {
        uuid: writeUuid,
        properties: PROPERTY_WRITE,
        permissions: PERMISSION_WRITE
      },
      serviceUuid
    )

    bleModule.addCharacteristic(
      {
        uuid: writeCmdUuid,
        properties: PROPERTY_WRITE_NO_RESPONSE,
        permissions: PERMISSION_WRITE
      },
      serviceUuid
    )

    bleModule.addCharacteristic(
      {
        uuid: notifyUuid,
        properties: PROPERTY_NOTIFY | PROPERTY_INDICATE,
        permissions: PERMISSION_READ
      },
      serviceUuid
    )

    this.handleRequests().finally()
  }

  async stop() {
    if (!this.isStarted) {
      return
    }
    bleModule.removeService(this.spec.serviceUuid)
  }

  enterApp(app: App | string) {
    const name = app.split(' ')[0]
    switch (name) {
      case 'Bitcoin':
        this.app = App.Bitcoin
        break
      case 'Ethereum':
        this.app = App.Ethereum
        break
      case 'Solana':
        this.app = App.Solana
        break
      case 'Cosmos':
        this.app = App.Cosmos
        break
      case 'Aptos':
        this.app = App.Aptos
        break
      case 'Sui':
        this.app = App.Sui
        break
      case 'Tron':
        this.app = App.Tron
        break
      default:
        throw new TransportError(`App not supported: ${name}`, 'AppNotSupported')
    }
  }

  exitApp() {
    this.app = undefined
  }

  async receive(): Promise<{
    cla: number
    ins: number
    p1: number
    p2: number
    data: Uint8Array
  }> {
    const buffer = await firstValueFrom(
      merge(
        BlePeripheral.instance().monitorCharacteristic(this.spec.writeCmdUuid),
        BlePeripheral.instance().monitorCharacteristic(this.spec.writeUuid)
      ).pipe(
        filter((char) => !!char.value),
        map((char) => Buffer.from(char.value!)),
        (stream) => receiveAPDU(stream)
      )
    )

    const cla = buffer.readUint8()
    const ins = buffer.readUint8(1)
    const p1 = buffer.readUint8(2)
    const p2 = buffer.readUint8(3)
    let data
    if (buffer.length > 4) {
      const len = buffer.readUint8(4)
      data = buffer.subarray(5)
      if (data.length !== len) {
        throw new TransportError(
          `data length mismatch. Expected: ${len}, got: ${data.length}`,
          'DataLengthMismatch'
        )
      }
    } else {
      data = new Uint8Array()
    }

    return {
      cla,
      ins,
      p1,
      p2,
      data
    }
  }

  async send(data: Buffer = Buffer.alloc(0)) {
    if (data.length >= 256) {
      throw new TransportError(
        'data.length exceed 256 bytes limit. Got: ' + data.length,
        'DataLengthTooBig'
      )
    }

    await firstValueFrom(sendAPDU(this.write, data, this.mtuSize))
  }

  private async write(data: Uint8Array, retry = true) {
    const success = bleModule.updateCharacteristic(
      {
        uuid: this.spec.notifyUuid,
        value: data
      },
      this.spec.serviceUuid
    )
    if (success) {
      return
    }
    if (retry) {
      await BlePeripheral.instance().waitForNotificationReady()
      await this.write(data, false)
    } else {
      throw new TransportError('updateCharacteristic returned false', 'WriteFailed')
    }
  }

  async handleRequests() {
    while (this.isStarted) {
      try {
        await this.handleRequest()
      } catch (err) {
        logger.error(err, { tags: { file: 'ble/index', function: 'handleRequests' } })
        await sleep(2000)
      }
    }
  }

  async handleRequest() {
    const { cla, ins, p1, p2, data } = await this.receive()

    switch (cla) {
      case Constant.CLA_B0:
        if (ins === Constant.INS_01 && p1 === Constant.P1_00 && p2 === Constant.P2_00) {
          // getAppAndVersion
          // https://developers.ledger.com/docs/connectivity/ledgerJS/open-close-info-on-apps#get-information
          const [name, version] = (this.app || LedgerOS).split(' ')
          const format = 1
          const flags: number[] = []
          await this.send(
            Buffer.concat([
              Buffer.from([format, name.length]),
              Buffer.from(name),
              Buffer.from([version.length]),
              Buffer.from(version),
              Buffer.from([flags.length]),
              Buffer.from(flags),
              bufferStatusCode(StatusCodes.OK)])
          )
        } else if (ins === Constant.INS_A7 && p1 === Constant.P1_00 && p2 === Constant.P2_00) {
          // quitApp
          // https://developers.ledger.com/docs/connectivity/ledgerJS/open-close-info-on-apps#quit-application
          // Does not require any operation from the user, and operates silently.
          this.exitApp()
          await this.send(Buffer.from([0x90, 0x00]))
        }
        break
      case Constant.CLA_E0:
        if (ins === Constant.INS_10 && p1 === Constant.P1_00) {
          // getBatteryStatus
          switch (p2) {
            case BatteryStatusTypes.BATTERY_PERCENTAGE:
              await this.send(Buffer.concat([Buffer.from([100]), bufferStatusCode(StatusCodes.OK)]))
              break
            case BatteryStatusTypes.BATTERY_VOLTAGE:
              await this.send(
                Buffer.concat([Buffer.from([0, 30]), bufferStatusCode(StatusCodes.OK)])
              )
              break
            case BatteryStatusTypes.BATTERY_TEMPERATURE:
            // pass through
            case BatteryStatusTypes.BATTERY_CURRENT:
              await this.send(Buffer.concat([Buffer.from([30]), bufferStatusCode(StatusCodes.OK)]))
              break
            case BatteryStatusTypes.BATTERY_FLAGS:
              await this.send(
                Buffer.concat([Buffer.from([0, 0, 0, 0]), bufferStatusCode(StatusCodes.OK)])
              )
              break
            default:
              await this.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
              break
          }
        } else if (p1 === Constant.P1_00 && p2 === Constant.P2_00) {
          // openApp
          // https://developers.ledger.com/docs/connectivity/ledgerJS/open-close-info-on-apps#open-application
          switch (ins) {
            case Constant.INS_D8:
              const name = Buffer.from(data).toString('ascii')
              if (!name) {
                await this.send(Buffer.from([0x67, 0x0a]))
              } else {
                // TODO: request user consent
                try {
                  this.enterApp(name)
                  await this.send(Buffer.from([0x90, 0x00]))
                } catch {
                  await this.send(Buffer.from([0x68, 0x07]))
                }
              }
              break
            case Constant.INS_D4:
              // editDeviceName
              await this.send(bufferStatusCode(StatusCodes.USER_REFUSED_ON_DEVICE))
              break
            default:
              await this.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
              break
          }
        }
        break
      default:
        await this.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
        break
    }
  }
}

enum Constant {
  CLA_B0 = 0xb0,
  CLA_E0 = 0xe0,
  INS_01 = 0x01,
  INS_10 = 0x10,
  INS_A7 = 0xa7,
  INS_D4 = 0xd4,
  INS_D8 = 0xd8,
  P1_00 = 0x00,
  P2_00 = 0x00
}

// for Ledger Nano X
// https://support.ledger.com/article/7103926130845-zd
const LedgerOS = 'BOLOS 2.2.4'

enum App {
  Bitcoin = 'Bitcoin 2.2.3',
  Ethereum = 'Ethereum 1.10.4',
  Solana = 'Solana 1.4.3',
  Cosmos = 'Cosmos 2.35.22',
  Aptos = 'Aptos 0.6.9',
  Sui = 'Sui 0.2.1',
  Tron = 'Tron 0.5.0'
}

export enum BatteryStatusTypes {
  BATTERY_PERCENTAGE = 0x00,
  BATTERY_VOLTAGE = 0x01,
  BATTERY_TEMPERATURE = 0x02,
  BATTERY_CURRENT = 0x03,
  BATTERY_FLAGS = 0x04
}

function bufferStatusCode(statusCode: number) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16BE(statusCode)
  return buffer
}

function equals(a: [], b: []) {
  return a.length === b.length && a.every((val, index) => val === b[index])
}
