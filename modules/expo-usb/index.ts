import { EventEmitter, NativeModulesProxy, Subscription } from 'expo-modules-core'

import { ChangeEventPayload } from './src/ExpoUsb.types'
import ExpoUsbModule from './src/ExpoUsbModule'

// Get the native constant value.
export const PI = ExpoUsbModule.PI

export function hello(): string {
  return ExpoUsbModule.hello()
}

export async function setValueAsync(value: string) {
  return await ExpoUsbModule.setValueAsync(value)
}

const emitter = new EventEmitter(ExpoUsbModule ?? NativeModulesProxy.ExpoUsb)

export function addChangeListener(listener: (event: ChangeEventPayload) => void): Subscription {
  return emitter.addListener<ChangeEventPayload>('onChange', listener)
}

export { ChangeEventPayload }
