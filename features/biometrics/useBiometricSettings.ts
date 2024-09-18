import { useAtom } from 'jotai'
import { RESET } from 'jotai/utils'
import { useCallback } from 'react'

import { atomWithLocalStore, storeKey } from '@/archmage/store'

export enum BiometricSettingType {
  RequiredForAppAccess,
  RequiredForTransactions
}

interface BiometricSettingsState {
  requiredForAppAccess: boolean
  requiredForTransactions: boolean
}

const BIOMETRIC_SETTINGS_KEY = storeKey('biometric')

const biometricSettingsAtom = atomWithLocalStore<BiometricSettingsState>(BIOMETRIC_SETTINGS_KEY, {
  requiredForAppAccess: false,
  requiredForTransactions: false
})

export function useBiometricSettings() {
  const [biometricSettings, setBiometricSettings] = useAtom(biometricSettingsAtom)

  const setRequiredForAppAccess = useCallback(async (required: boolean) => {
    await setBiometricSettings((biometric) => ({
      ...biometric,
      requiredForAppAccess: required
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setRequiredForTransactions = useCallback(async (required: boolean) => {
    await setBiometricSettings((biometric) => ({
      ...biometric,
      requiredForTransactions: required
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = useCallback(async () => {
    await setBiometricSettings(RESET)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    requiredForAppAccess: biometricSettings?.requiredForAppAccess,
    requiredForTransactions: biometricSettings?.requiredForTransactions,
    setRequiredForAppAccess,
    setRequiredForTransactions,
    reset
  }
}
