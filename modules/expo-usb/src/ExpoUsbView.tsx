import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';

import { ExpoUsbViewProps } from './ExpoUsb.types';

const NativeView: React.ComponentType<ExpoUsbViewProps> =
  requireNativeViewManager('ExpoUsb');

export default function ExpoUsbView(props: ExpoUsbViewProps) {
  return <NativeView {...props} />;
}
