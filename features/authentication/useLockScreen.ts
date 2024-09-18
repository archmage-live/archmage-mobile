import { useIsFocused } from '@react-navigation/native'
import { atom, useAtom } from 'jotai'

import { useAppStateTrigger } from '@/lib/hooks/useAppStateTrigger'

type AnimationType = 'none' | 'slide' | 'fade' | undefined

const isLockScreenVisibleAtom = atom(true)
const animationTypeAtom = atom<AnimationType>('none')

export function useLockScreen() {
  const [isLockScreenVisible, setIsLockScreenVisible] = useAtom(isLockScreenVisibleAtom)
  const [animationType, setAnimationType] = useAtom(animationTypeAtom)

  return {
    isLockScreenVisible,
    animationType,
    setIsLockScreenVisible,
    setAnimationType
  }
}

export function useLockScreenOnBlur(isDisabled?: boolean): void {
  // Show splash screen if app switcher is opened
  const { setIsLockScreenVisible } = useLockScreen()
  const isFocused = useIsFocused()
  useAppStateTrigger('inactive', 'active', () => {
    if (!isFocused || isDisabled) {
      return
    }
    setIsLockScreenVisible(false)
  })
  useAppStateTrigger('active', 'inactive', () => {
    if (!isFocused || isDisabled) {
      return
    }
    setIsLockScreenVisible(true)
  })
  useAppStateTrigger('background', 'active', () => {
    if (!isFocused || isDisabled) {
      return
    }
    setIsLockScreenVisible(false)
  })
  useAppStateTrigger('active', 'background', () => {
    if (!isFocused || isDisabled) {
      return
    }
    setIsLockScreenVisible(true)
  })
}
