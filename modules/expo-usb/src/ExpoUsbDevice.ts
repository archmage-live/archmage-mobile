import ExpoUsbModule from './ExpoUsbModule'

abstract class Destroyable {
  protected constructor(
    public readonly uuid: string,
    cleanup: () => void
  ) {
    Destroyable.cache.set(uuid, cleanup)
    registry.register(this, uuid)
  }

  private static cache = new Map<string, () => void>()

  static destroy(uuid: string) {
    const cleanup = Destroyable.cache.get(uuid)
    if (cleanup) {
      Destroyable.cache.delete(uuid)
      cleanup()
    }
  }

  destroy() {
    Destroyable.destroy(this.uuid)
  }
}

const registry = new FinalizationRegistry((uuid: string) => {
  Destroyable.destroy(uuid)
})

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
  ) {}

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

export class ExpoUsbDeviceConnection extends Destroyable {
  constructor(uuid: string) {
    super(uuid, () => ExpoUsbModule.closeDevice(this.uuid))
  }

  claimInterface(inf: ExpoUsbInterface, force: boolean = true): boolean {
    return ExpoUsbModule.claimInterface(this.uuid, inf.id, inf.alternateSetting, force)
  }

  releaseInterface(inf: ExpoUsbInterface): boolean {
    return ExpoUsbModule.claimInterface(this.uuid, inf.id, inf.alternateSetting)
  }

  setInterface(inf: ExpoUsbInterface): boolean {
    return ExpoUsbModule.setInterface(this.uuid, inf.id, inf.alternateSetting)
  }

  setConfiguration(conf: ExpoUsbConfiguration): boolean {
    return ExpoUsbModule.setConfiguration(this.uuid, conf.id)
  }

  controlTransfer(args: {
    requestType: number
    request: number
    value: number
    index: number
    buffer: Uint8Array
    offset?: number
    length: number
    timeout: number
  }): number | false {
    const bytes = ExpoUsbModule.controlTransfer(this.uuid, args)
    return bytes >= 0 ? bytes : false
  }

  bulkTransfer(
    endpoint: ExpoUsbEndpoint,
    args: {
      buffer: Uint8Array
      offset?: number
      length: number
      timeout: number
    }
  ): number | false {
    const bytes = ExpoUsbModule.bulkTransfer(this.uuid, {
      ...args,
      endpointAddress: endpoint.address
    })
    return bytes >= 0 ? bytes : false
  }
}

export class ExpoUsbRequest extends Destroyable {
  constructor(connection: ExpoUsbDeviceConnection, endpoint: ExpoUsbEndpoint) {
    super(ExpoUsbModule.createRequest(connection.uuid, endpoint.address), () =>
      ExpoUsbModule.destroyRequest(this.uuid)
    )
  }

  cancel() {
    ExpoUsbModule.cancelRequest(this.uuid)
  }

  async write(data: Uint8Array): Promise<void> {
    await ExpoUsbModule.writeRequest(this.uuid, data)
  }

  async read(maxBytes: number): Promise<Uint8Array> {
    return await ExpoUsbModule.readRequest(this.uuid, maxBytes)
  }
}
