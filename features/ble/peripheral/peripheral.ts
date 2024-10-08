import bleModule from 'expo-ble-peripheral'

export class BlePeripheral {
  private static _instance: BlePeripheral

  static instance() {
    if (!this._instance) {
      this._instance = new BlePeripheral()
    }
    return this._instance
  }

  private constructor() {}

  get isStarted() {
    return bleModule.isStarted
  }

  get isAdvertising() {
    return bleModule.isAdvertising
  }

  async start() {
    if (!this.isStarted) {
      bleModule.setName('Archmage Bluetooth')

      await bleModule.start()
    }
  }

  async stop() {
    await bleModule.stop()
  }

  async startAdvertising() {
    if (!this.isAdvertising) {
      await bleModule.startAdvertising({
        advertiseData: {
          includeTxPowerLevel: true,
          includeDeviceName: true
        },
        parameters: {
          includeTxPower: true,
          connectable: true,
          discoverable: true
        }
      })
    }
  }

  async stopAdvertising() {
    await bleModule.stopAdvertising()
  }
}
