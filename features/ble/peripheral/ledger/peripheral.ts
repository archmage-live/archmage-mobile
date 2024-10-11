import { DeviceModelId, getDeviceModel } from '@ledgerhq/devices'
import { receiveAPDU } from '@ledgerhq/devices/lib/ble/receiveAPDU'
import { sendAPDU } from '@ledgerhq/devices/lib/ble/sendAPDU'
import { TransportError } from '@ledgerhq/errors'
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

export abstract class BaseLedgerBlePeripheral {
  protected device = getDeviceModel(DeviceModelId.nanoX)
  protected spec = this.device.bluetoothSpec![0]

  protected mtuSize = 20

  protected isStarted = false

  app?: App

  protected constructor() {}

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
    switch (app) {
      case App.Bitcoin:
        this.app = App.Bitcoin
        break
      case App.Ethereum:
        this.app = App.Ethereum
        break
      case App.Solana:
        this.app = App.Solana
        break
      case App.Cosmos:
        this.app = App.Cosmos
        break
      case App.Aptos:
        this.app = App.Aptos
        break
      case App.Sui:
        this.app = App.Sui
        break
      case App.Tron:
        this.app = App.Tron
        break
      default:
        throw new TransportError(`App not supported: ${app}`, 'AppNotSupported')
    }
  }

  exitApp() {
    this.app = undefined
  }

  async receive(): Promise<APDU> {
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
      data = Buffer.alloc(0)
    }

    return [
      cla,
      ins,
      p1,
      p2,
      data
    ]
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

  abstract handleRequest(): Promise<void>
}

export type APDU = [
  /* 1 byte unsigned int */
  cla: number,
  /* 1 byte unsigned int */
  ins: number,
  /* 1 byte unsigned int */
  p1: number,
  /* 1 byte unsigned int */
  p2: number,
  /* data (optional) */
  data: Buffer | undefined
]

export enum Constant {
  CLA_B0 = 0xb0,
  CLA_E0 = 0xe0,
  CLA_F0 = 0xf0,
  INS_01 = 0x01,
  INS_02 = 0x02,
  INS_04 = 0x04,
  INS_06 = 0x06,
  INS_08 = 0x08,
  INS_0C = 0x0c,
  INS_10 = 0x10,
  INS_1A = 0x1a,
  INS_20 = 0x20,
  INS_A7 = 0xa7,
  INS_D4 = 0xd4,
  INS_D8 = 0xd8,
  P1_00 = 0x00,
  P2_00 = 0x00
}

// for Ledger Nano X
// https://support.ledger.com/article/7103926130845-zd
export const LedgerOS = 'BOLOS'
export const LedgerOSVersion = '2.2.4'

export enum App {
  Bitcoin = 'Bitcoin',
  Ethereum = 'Ethereum',
  Solana = 'Solana',
  Cosmos = 'Cosmos',
  Aptos = 'Aptos',
  Sui = 'Sui',
  Tron = 'Tron'
}

export enum AppVersion {
  Bitcoin = '2.2.3',
  Ethereum = '1.10.4',
  Solana = '1.4.3',
  Cosmos = '2.35.22',
  Aptos = '0.6.9',
  Sui = '0.2.1',
  Tron = '0.5.0'
}

export enum BatteryStatusTypes {
  BATTERY_PERCENTAGE = 0x00,
  BATTERY_VOLTAGE = 0x01,
  BATTERY_TEMPERATURE = 0x02,
  BATTERY_CURRENT = 0x03,
  BATTERY_FLAGS = 0x04
}

export type Request = {
  app: App
  type: number
  args?: Record<string, any>
}

export abstract class RequestHandler {
  constructor(protected peripheral: BaseLedgerBlePeripheral) {}

  abstract handleRequest(apdu: APDU): Promise<void>

  abstract respond(req: Request, rep: Record<string, any>): Promise<void>

  abstract clean(): void
}

export function bufferStatusCode(statusCode: number) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16BE(statusCode)
  return buffer
}

function equals(a: [], b: []) {
  return a.length === b.length && a.every((val, index) => val === b[index])
}
