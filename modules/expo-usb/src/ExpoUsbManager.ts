import { EventEmitter, NativeModulesProxy, Subscription } from 'expo-modules-core'

import { ExpoUsbAccessory } from './ExpoUsbAccessory'
import {
  ExpoUsbConfiguration,
  ExpoUsbDevice,
  ExpoUsbDeviceConnection,
  ExpoUsbEndpoint,
  ExpoUsbInterface
} from './ExpoUsbDevice'
import ExpoUsbModule from './ExpoUsbModule'

export class ExpoUsbManager {
  private static singleton?: ExpoUsbManager

  static getInstance() {
    if (!ExpoUsbManager.singleton) {
      ExpoUsbManager.singleton = new ExpoUsbManager()
    }
    return ExpoUsbManager.singleton
  }

  private constructor() {}

  getDeviceList() {
    const devices: Record<string, any> = ExpoUsbModule.getDeviceList()

    const list = new Map<string, ExpoUsbDevice>()
    for (const key in devices) {
      const device = devices[key]
      list.set(key, this.newDevice(device))
    }
    return list
  }

  private newDevice(device: any) {
    return new ExpoUsbDevice(
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
      device.configurations.map(
        (conf: any) =>
          new ExpoUsbConfiguration(
            conf.id,
            conf.name,
            conf.isSelfPowered,
            conf.isRemoteWakeup,
            conf.maxPower,
            conf.interfaces.map(
              (inf: any) =>
                new ExpoUsbInterface(
                  inf.id,
                  inf.alternateSetting,
                  inf.name,
                  inf.interfaceClass,
                  inf.interfaceSubclass,
                  inf.interfaceProtocol,
                  inf.endpoints.map(
                    (ep: any) =>
                      new ExpoUsbEndpoint(
                        ep.address,
                        ep.endpointNumber,
                        ep.direction,
                        ep.attributes,
                        ep.type,
                        ep.maxPacketSize,
                        ep.interval
                      )
                  )
                )
            )
          )
      )
    )
  }

  getAccessoryList() {
    const accessories = ExpoUsbModule.getAccessoryList()
    const list = []
    for (const accessory of accessories) {
      list.push(this.newAccessory(accessory))
    }
    return list
  }

  private newAccessory(accessory: any) {
    return new ExpoUsbAccessory(
      accessory.hashCode,
      accessory.manufacturer,
      accessory.model,
      accessory.description,
      accessory.version,
      accessory.uri,
      accessory.serial
    )
  }

  openDevice(device: ExpoUsbDevice) {
    const uuid = ExpoUsbModule.openDevice(device.deviceName)
    if (!uuid) {
      return false
    }
    return new ExpoUsbDeviceConnection(uuid)
  }

  openAccessory(accessory: ExpoUsbAccessory): boolean {
    return ExpoUsbModule.openAccessory(accessory.hashCode)
  }

  hasPermission(deviceOrAccessory: ExpoUsbDevice | ExpoUsbAccessory): boolean {
    return deviceOrAccessory instanceof ExpoUsbDevice
      ? ExpoUsbModule.hasDevicePermission(deviceOrAccessory.deviceName)
      : ExpoUsbModule.hasAccessoryPermission(deviceOrAccessory.hashCode)
  }

  async requestPermission(deviceOrAccessory: ExpoUsbDevice | ExpoUsbAccessory) {
    await (deviceOrAccessory instanceof ExpoUsbDevice
      ? ExpoUsbModule.requestDevicePermission(deviceOrAccessory.deviceName)
      : ExpoUsbModule.requestAccessoryPermission(deviceOrAccessory.hashCode))
  }

  addDeviceConnectListener(listener: (device: ExpoUsbDevice) => void): Subscription {
    return emitter.addListener<any>(DEVICE_CONNECT_EVENT_NAME, (device) => {
      listener(this.newDevice(device))
    })
  }

  addDeviceDisconnectListener(listener: (device: ExpoUsbDevice) => void): Subscription {
    return emitter.addListener<any>(DEVICE_DISCONNECT_EVENT_NAME, (device) => {
      listener(this.newDevice(device))
    })
  }

  addAccessoryConnectListener(listener: (accessory: ExpoUsbAccessory) => void): Subscription {
    return emitter.addListener<any>(ACCESSORY_CONNECT_EVENT_NAME, (accessory) => {
      listener(this.newAccessory(accessory))
    })
  }

  addAccessoryDisconnectListener(listener: (accessory: ExpoUsbAccessory) => void): Subscription {
    return emitter.addListener<any>(ACCESSORY_DISCONNECT_EVENT_NAME, (accessory) => {
      listener(this.newAccessory(accessory))
    })
  }
}

const DEVICE_CONNECT_EVENT_NAME = 'onDeviceConnect'
const DEVICE_DISCONNECT_EVENT_NAME = 'onDeviceDisconnect'
const ACCESSORY_CONNECT_EVENT_NAME = 'onAccessoryConnect'
const ACCESSORY_DISCONNECT_EVENT_NAME = 'onAccessoryDisconnect'

const emitter = new EventEmitter(ExpoUsbModule ?? NativeModulesProxy.ExpoUsb)
