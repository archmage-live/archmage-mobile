import {
  LocalAuthenticationResult,
  authenticateAsync,
  hasHardwareAsync,
  isEnrolledAsync
} from 'expo-local-authentication'
import { NativeModulesProxy } from 'expo-modules-core'

import i18n from '@/archmage/i18n'
import { logger } from '@/archmage/logger/logger'

const ELA = NativeModulesProxy.ExpoLocalAuthentication

/**
 * Biometric authentication statuses
 * Note. Sorted by authentication level
 */
export enum BiometricAuthenticationStatus {
  Unsupported = 'UNSUPPORTED',
  MissingEnrollment = 'MISSING_ENROLLMENT',
  Rejected = 'REJECTED',
  Authenticated = 'AUTHENTICATED',
  Authenticating = 'AUTHENTICATING',
  Lockout = 'LOCKOUT',
  UserCancel = 'USER_CANCEL',
  SystemCancel = 'SYSTEM_CANCEL',
  Invalid = 'INVALID'
}

export async function enroll(): Promise<void> {
  ELA?.enrollForAuthentication()
}

export async function tryLocalAuthenticate(): Promise<BiometricAuthenticationStatus> {
  try {
    const compatible = await hasHardwareAsync()

    if (!compatible) {
      return BiometricAuthenticationStatus.Unsupported
    }

    /**
     * Important: ExpoLocalAuthentication.isEnrolledAsync() method nested in isEnrolledAsync() returns false when users exceeds the amount of retries. Exactly the same when user has no biometric setup on the device
     and that's why we have to call authenticateAsync to be able to distinguish between different errors.
     */
    const enrolled = await isEnrolledAsync()
    const result = await authenticateAsync({
      cancelLabel: i18n.t('common.button.cancel'),
      promptMessage: i18n.t('settings.setting.biometrics.auth'),
      requireConfirmation: false
    })

    if (result.success) {
      return BiometricAuthenticationStatus.Authenticated
    }

    if (isInLockout(result)) {
      return BiometricAuthenticationStatus.Lockout
    }

    if (isCanceledByUser(result)) {
      return BiometricAuthenticationStatus.UserCancel
    }

    if (isCanceledBySystem(result)) {
      return BiometricAuthenticationStatus.SystemCancel
    }

    if (!enrolled) {
      return BiometricAuthenticationStatus.MissingEnrollment
    }

    return BiometricAuthenticationStatus.Rejected
  } catch (error) {
    logger.error(error, { tags: { file: 'biometrics/index', function: 'tryLocalAuthenticate' } })

    return BiometricAuthenticationStatus.Rejected
  }
}

const isInLockout = (result: LocalAuthenticationResult): boolean =>
  !result.success && result.error === 'lockout'

const isCanceledByUser = (result: LocalAuthenticationResult): boolean =>
  !result.success && result.error === 'user_cancel'

const isCanceledBySystem = (result: LocalAuthenticationResult): boolean =>
  !result.success && result.error === 'system_cancel'