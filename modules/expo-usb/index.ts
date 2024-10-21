import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to ExpoUsb.web.ts
// and on native platforms to ExpoUsb.ts
import ExpoUsbModule from './src/ExpoUsbModule';
import ExpoUsbView from './src/ExpoUsbView';
import { ChangeEventPayload, ExpoUsbViewProps } from './src/ExpoUsb.types';

// Get the native constant value.
export const PI = ExpoUsbModule.PI;

export function hello(): string {
  return ExpoUsbModule.hello();
}

export async function setValueAsync(value: string) {
  return await ExpoUsbModule.setValueAsync(value);
}

const emitter = new EventEmitter(ExpoUsbModule ?? NativeModulesProxy.ExpoUsb);

export function addChangeListener(listener: (event: ChangeEventPayload) => void): Subscription {
  return emitter.addListener<ChangeEventPayload>('onChange', listener);
}

export { ExpoUsbView, ExpoUsbViewProps, ChangeEventPayload };
