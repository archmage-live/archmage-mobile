import { DeviceModelId, getDeviceModel } from '@ledgerhq/devices'
import { receiveAPDU } from '@ledgerhq/devices/lib/ble/receiveAPDU'
import { sendAPDU } from '@ledgerhq/devices/lib/ble/sendAPDU'
import bleModule, {
  PERMISSION_READ,
  PERMISSION_WRITE,
  PROPERTY_INDICATE,
  PROPERTY_NOTIFY,
  PROPERTY_WRITE,
  PROPERTY_WRITE_NO_RESPONSE
} from 'expo-ble-peripheral'

export class LedgerBlePeripheral {
  private static _instance: LedgerBlePeripheral

  static instance() {
    if (!this._instance) {
      this._instance = new LedgerBlePeripheral()
    }
    return this._instance
  }

  private device = getDeviceModel(DeviceModelId.stax)

  private constructor() {
    const spec = this.device.bluetoothSpec![0]
    const serviceUuid = spec.serviceUuid

    bleModule.addService(serviceUuid, true)

    bleModule.addCharacteristic(
      {
        uuid: spec.writeUuid,
        properties: PROPERTY_WRITE,
        permissions: PERMISSION_WRITE
      },
      serviceUuid
    )

    bleModule.addCharacteristic(
      {
        uuid: spec.writeCmdUuid,
        properties: PROPERTY_WRITE_NO_RESPONSE,
        permissions: PERMISSION_WRITE
      },
      serviceUuid
    )

    bleModule.addCharacteristic(
      {
        uuid: spec.notifyUuid,
        properties: PROPERTY_NOTIFY | PROPERTY_INDICATE,
        permissions: PERMISSION_READ
      },
      serviceUuid
    )
  }
}
