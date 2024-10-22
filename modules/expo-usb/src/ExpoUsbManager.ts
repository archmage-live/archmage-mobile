import { ExpoUsbDevice } from '@/modules/expo-usb/src/ExpoUsbDevice'

import ExpoUsbModule from './ExpoUsbModule'

export class ExpoUsbManager {
  getDeviceList() {
    const devices: Record<string, any> = ExpoUsbModule.getDeviceList()

    const list = new Map<string, ExpoUsbDevice>()
    for (const key in devices) {
      const device = devices[key]
      list.set(
        key,
        new ExpoUsbDevice(
          device.deviceName,
          device.manufacturerName,
          device.productName,
          device.version,
          device.serialNumber,
          device.deviceId,
          device.vendorId,
          device.productId,
          device.deviceClass,
          device.deviceSubclass,
          device.deviceProtocol,
          device.configurations
        )
      )
    }
    return list
  }

  getAccessoryList() {
    return ExpoUsbModule
  }
}
