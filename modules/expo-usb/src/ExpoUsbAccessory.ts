import ExpoUsbModule from './ExpoUsbModule'

export class ExpoUsbAccessory {
  constructor(
    readonly hashCode: string,
    readonly manufacturer: string,
    readonly model: string,
    readonly description: string,
    readonly version: string,
    readonly uri: string,
    readonly serial: string
  ) {}

  destroy() {
    ExpoUsbModule.closeAccessory(this.hashCode)
  }

  async write(data: Uint8Array): Promise<void> {
    await ExpoUsbModule.writeAccessory(this.hashCode, data)
  }

  async read(maxBytes: number): Promise<Uint8Array> {
    return await ExpoUsbModule.readAccessory(this.hashCode, maxBytes)
  }
}
