import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColorScheme as useNativewindColorScheme } from 'nativewind'
import { useCallback } from 'react'
import {
  Appearance,
  ColorSchemeName,
  useColorScheme as useReactnativeColorScheme
} from 'react-native'
import useAsync from 'react-use/lib/useAsync'

export function useColorScheme() {
  const colorScheme = useReactnativeColorScheme()
  const nativewindColorScheme = useNativewindColorScheme()

  const setColorScheme = useCallback(
    async (colorScheme: ColorSchemeName) => {
      Appearance.setColorScheme(colorScheme)
      nativewindColorScheme.setColorScheme(colorScheme || 'system')
      await AsyncStorage.setItem('colorScheme', colorScheme || 'system')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const toggleColorScheme = useCallback(async () => {
    await setColorScheme(colorScheme === 'light' ? 'dark' : colorScheme === 'dark' ? null : 'light')
  }, [colorScheme, setColorScheme])

  const { value: isColorSchemeLoaded } = useAsync(async () => {
    const stored = (await AsyncStorage.getItem('colorScheme')) as 'light' | 'dark' | 'system' | null
    if (stored) {
      await setColorScheme(stored === 'system' ? null : stored)
    }
    return true
  }, [setColorScheme])

  return {
    colorScheme,
    isDarkColorScheme: colorScheme === 'dark',
    setColorScheme,
    toggleColorScheme,
    isColorSchemeLoaded
  }
}
