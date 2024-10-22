export class ExpoUsbAccessory {
  constructor(
    readonly manufacturer: string,
    readonly getModel: string,
    readonly getDescription: string,
    readonly getVersion: string,
    readonly getUri: string,
    readonly getSerial: string
  ) {}
}
