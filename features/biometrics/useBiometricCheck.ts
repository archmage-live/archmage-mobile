import * as SplashScreen from 'expo-splash-screen'
import { useCallback } from 'react'
import { useAsync } from 'react-use'

import { useLockScreen } from '@/features/authentication/useLockScreen'
import { useAppStateTrigger } from '@/lib/hooks/useAppStateTrigger'

import { BiometricAuthenticationStatus } from '.'
import { useBiometricPrompt } from './hooks'
import { useBiometricAuthStatus } from './useBiometricAuthStatus'
import { useBiometricSettings } from './useBiometricSettings'

// TODO: [MOB-221] handle scenario where user has biometrics enabled as in-app security but disables it at the OS level
export function useBiometricCheck(): void {
  const { requiredForAppAccess } = useBiometricSettings()
  const { setIsLockScreenVisible } = useLockScreen()
  const { authenticationStatus, setAuthenticationStatus } = useBiometricAuthStatus()
  const successCallback = (): void => {
    setIsLockScreenVisible(false)
  }

  const { trigger } = useBiometricPrompt(successCallback)

  const triggerBiometricCheck = useCallback(async () => {
    if (requiredForAppAccess) {
      await trigger()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // runs only on mount so it doesn't run on setting change

  useAsync(triggerBiometricCheck)

  useAppStateTrigger('background', 'active', async () => {
    if (
      requiredForAppAccess &&
      authenticationStatus !== BiometricAuthenticationStatus.Authenticated
    ) {
      await trigger()
    }
  })

  useAppStateTrigger('inactive', 'background', () => {
    if (requiredForAppAccess) {
      setAuthenticationStatus(BiometricAuthenticationStatus.Invalid)
      setIsLockScreenVisible(true)
    }
  })

  useAppStateTrigger('active', 'background', () => {
    if (requiredForAppAccess) {
      setAuthenticationStatus(BiometricAuthenticationStatus.Invalid)
      setIsLockScreenVisible(true)
    }
  })

  useAppStateTrigger('inactive', 'active', async () => {
    await SplashScreen.hideAsync() // In case of a race condition where splash screen is not hidden, we want to hide when FaceID forces an app state change
    // Requires negative check because we don't want to authenticate when switching between active and inactive state
    // It is just required for the case when authentication was requested but user went to app switcher and back to the app
    // to avoid authentication
    if (
      requiredForAppAccess &&
      authenticationStatus !== BiometricAuthenticationStatus.Authenticating &&
      authenticationStatus !== BiometricAuthenticationStatus.SystemCancel &&
      authenticationStatus !== BiometricAuthenticationStatus.UserCancel &&
      authenticationStatus !== BiometricAuthenticationStatus.Rejected &&
      authenticationStatus !== BiometricAuthenticationStatus.Lockout
    ) {
      setIsLockScreenVisible(false)
    }
  })

  useAppStateTrigger('active', 'inactive', async () => {
    await SplashScreen.hideAsync() // In case of a race condition where splash screen is not hidden, we want to hide when FaceID forces an app state change
    if (
      requiredForAppAccess &&
      authenticationStatus !== BiometricAuthenticationStatus.Authenticating
    ) {
      setIsLockScreenVisible(true)
    }
  })
}