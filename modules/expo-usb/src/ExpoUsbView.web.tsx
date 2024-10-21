import * as React from 'react';

import { ExpoUsbViewProps } from './ExpoUsb.types';

export default function ExpoUsbView(props: ExpoUsbViewProps) {
  return (
    <div>
      <span>{props.name}</span>
    </div>
  );
}
