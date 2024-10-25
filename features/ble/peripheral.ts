import EventEmitter from 'eventemitter3'
import bleModule, { Characteristic } from 'expo-ble-peripheral'
import { Subscription } from 'expo-modules-core'
import { Observable, filter, share } from 'rxjs'

export class BlePeripheral {
  private static _instance: BlePeripheral

  static instance() {
    if (!this._instance) {
      this._instance = new BlePeripheral()
    }
    return this._instance
  }

  private stateChangedSubscription?: Subscription
  private notificationReadySubscription?: Subscription
  private characteristicObservable?: Observable<Characteristic>

  private emitter = new EventEmitter()

  private constructor() {}

  get state() {
    return bleModule.state
  }

  get isStarted() {
    return bleModule.isStarted
  }

  get isAdvertising() {
    return bleModule.isAdvertising
  }

  onStateChanged(listener: (state: string) => void) {
    this.emitter.on('stateChanged', listener)
    return () => {
      this.emitter.off('stateChanged', listener)
    }
  }

  onNotificationReady(listener: () => void) {
    this.emitter.on('notificationReady', listener)
    return () => {
      this.emitter.off('notificationReady', listener)
    }
  }

  async waitForNotificationReady() {
    return new Promise<void>((resolve) => {
      let unsub: any
      let resolved = false
      const handler = () => {
        if (!resolved) {
          unsub()
          resolved = true
          resolve()
        }
      }
      unsub = this.onNotificationReady(handler)
      setTimeout(handler, 3000)
    })
  }

  monitorCharacteristic(uuid: string): Observable<Characteristic> {
    return this.characteristicObservable!.pipe(filter((char) => char.uuid === uuid))
  }

  async start() {
    if (!this.isStarted) {
      bleModule.setName('Archmage Bluetooth')

      this.stateChangedSubscription = bleModule.addStateChangedListener((event) => {
        this.emitter.emit('stateChanged', event.state)
      })
      this.notificationReadySubscription = bleModule.addNotificationReadyListener(() => {
        this.emitter.emit('notificationReady')
      })

      this.characteristicObservable = new Observable<Characteristic>((subscriber) => {
        const subscription = bleModule.addCharacteristicWrittenListener(({ characteristics }) => {
          for (const char of characteristics) {
            subscriber.next(char)
          }
        })

        return () => {
          subscription.remove()
        }
      }).pipe(share())

      await bleModule.start()
    }
  }

  async stop() {
    await bleModule.stop()

    this.stateChangedSubscription?.remove()
    this.notificationReadySubscription?.remove()
    this.characteristicObservable = undefined
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
