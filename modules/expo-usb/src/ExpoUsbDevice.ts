export class ExpoUsbDevice {
  constructor(
    readonly deviceName: string,
    readonly manufacturerName: string,
    readonly productName: string,
    readonly version: string,
    readonly serialNumber: string,
    readonly deviceId: number,
    readonly vendorId: number,
    readonly productId: number,
    readonly deviceClass: number,
    readonly deviceSubclass: number,
    readonly deviceProtocol: number,
    readonly configurations: ExpoUsbConfiguration[]
  ) {
    /*
    this.deviceName = device.deviceName
    this.manufacturerName = device.manufacturerName
    this.productName = device.productName
    this.version = device.version
    this.serialNumber = device.serialNumber
    this.deviceId = device.deviceId
    this.vendorId = device.vendorId
    this.productId = device.productId
    this.deviceClass = device.deviceClass
    this.deviceSubclass = device.deviceSubclass
    this.deviceProtocol = device.deviceProtocol
    */
  }

  private _interfaceList?: ExpoUsbInterface[]

  get interfaceList() {
    if (!this._interfaceList) {
      this._interfaceList = []
      for (const conf of this.configurations) {
        this._interfaceList.push(...conf.interfaces)
      }
    }
    return this._interfaceList
  }

  getInterface(index: number) {
    return this.interfaceList[index]
  }
}

export class ExpoUsbConfiguration {
  constructor(
    readonly id: number,
    readonly name: string,
    readonly isSelfPowered: boolean,
    readonly isRemoteWakeup: boolean,
    readonly attributes: number,
    readonly maxPower: number,
    readonly interfaces: ExpoUsbInterface[]
  ) {}

  getInterface(index: number) {
    return this.interfaces[index]
  }
}

export class ExpoUsbInterface {
  constructor(
    readonly id: number,
    readonly alternateSetting: number,
    readonly name: string,
    readonly interfaceClass: number,
    readonly interfaceSubclass: number,
    readonly interfaceProtocol: number,
    readonly endpoints: ExpoUsbEndpoint[]
  ) {}

  getEndpoint(index: number) {
    return this.endpoints[index]
  }
}

export class ExpoUsbEndpoint {
  constructor(
    readonly address: number,
    readonly endpointNumber: number,
    readonly direction: number,
    readonly attributes: number,
    readonly type: number,
    readonly maxPacketSize: number,
    readonly interval: number
  ) {}
}
