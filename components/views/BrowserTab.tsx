import WebView from '@metamask/react-native-webview'
import { useRef } from 'react'
import { View } from 'react-native'

export function BrowserTab() {
  const webviewRef = useRef(null)

  return (
    <View className="container mx-auto">
      <View>
        <>
          <WebView
            originWhitelist={[
              'https://',
              'http://',
              'metamask://',
              'dapp://',
              'wc://',
              'ethereum://',
              'file://',
              // Needed for Recaptcha
              'about:srcdoc'
            ]}
            decelerationRate={'normal'}
            ref={webviewRef}
          />
        </>
      </View>
    </View>
  )
}
