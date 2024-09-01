// sort-imports-ignore
import '@/global.css'

import { Theme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { verifyInstallation as nativewindVerifyInstallation } from 'nativewind'
import { useEffect } from 'react'
import 'react-native-reanimated'

import { useColorScheme } from '@/hooks/useColorScheme'
import { NAV_THEME } from '@/lib/constants'

const LIGHT_THEME: Theme = {
  dark: false,
  colors: NAV_THEME.light
}
const DARK_THEME: Theme = {
  dark: true,
  colors: NAV_THEME.dark
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router'

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  nativewindVerifyInstallation()

  const { isDarkColorScheme, isColorSchemeLoaded } = useColorScheme()

  const [isFontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf')
  })

  useEffect(() => {
    if (isColorSchemeLoaded && isFontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [isColorSchemeLoaded, isFontsLoaded])

  if (!isColorSchemeLoaded || !isFontsLoaded) {
    return null
  }

  return (
    <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
      <StatusBar style={isDarkColorScheme ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  )
}
