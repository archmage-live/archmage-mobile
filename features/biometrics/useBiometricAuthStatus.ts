import { atom, useAtom } from 'jotai'

import { debounceCallback } from '@/archmage/time/timing'

import { BiometricAuthenticationStatus } from '.'

const authenticationStatusAtom = atom(BiometricAuthenticationStatus.Invalid)

export function useBiometricAuthStatus() {
  const [status, setStatus] = useAtom(authenticationStatusAtom)
  const { triggerDebounce, cancelDebounce } = debounceCallback(
    () => setStatus(BiometricAuthenticationStatus.Invalid),
    10000 // 10 seconds
  )
  const setAuthenticationStatus = (value: BiometricAuthenticationStatus): void => {
    setStatus(value)
    if (value === BiometricAuthenticationStatus.Authenticated) {
      triggerDebounce()
    } else {
      cancelDebounce()
    }
  }

  return {
    authenticationStatus: status,
    setAuthenticationStatus
  }
}
