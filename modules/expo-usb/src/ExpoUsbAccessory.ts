import ExpoUsbModule from './ExpoUsbModule'

export class ExpoUsbAccessory {
  constructor(
    readonly hashCode: number,
    readonly manufacturer: string,
    readonly model: string,
    readonly description: string,
    readonly version: string,
    readonly uri: string,
    readonly serial: string
  ) {}
}

export class ExpoUsbAccessoryConnection {
  private static connections = new Map<number, ExpoUsbAccessoryConnection>()

  private constructor(readonly hashCode: number) {}

  static create(accessory: ExpoUsbAccessory) {
    let connection = ExpoUsbAccessoryConnection.connections.get(accessory.hashCode)
    if (!connection) {
      if (!ExpoUsbModule.openAccessory(accessory.hashCode)) {
        return false
      }
      connection = new ExpoUsbAccessoryConnection(accessory.hashCode)
      ExpoUsbAccessoryConnection.connections.set(accessory.hashCode, connection)
    }
    return connection
  }

  destroy() {
    if (ExpoUsbAccessoryConnection.connections.delete(this.hashCode)) {
      ExpoUsbModule.closeAccessory(this.hashCode)
    }
  }

  async write(data: Uint8Array): Promise<void> {
    await ExpoUsbModule.writeAccessory(this.hashCode, data)
  }

  async read(maxBytes: number): Promise<Uint8Array> {
    return await ExpoUsbModule.readAccessory(this.hashCode, maxBytes)
  }
}
