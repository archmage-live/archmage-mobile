import { createJSONStorage } from 'jotai/utils'
import { MMKV, Mode } from 'react-native-mmkv'

import { assert } from '@/archmage/errors'
import {
  SyncStorage,
  setLocalStore,
  setSecureLocalStore,
  setSecureSessionStore,
  setSessionStore
} from '@/archmage/store'

let initialized: boolean = false

export function initStorage(encryptionKey: string) {
  assert(!initialized, 'Storage already initialized')
  initialized = true

  const localStore = new MMKV({
    id: 'local-mmkv',
    mode: Mode.MULTI_PROCESS
  })
  const secureLocalStore = new MMKV({
    id: 'secure-local-mmkv',
    encryptionKey,
    mode: Mode.MULTI_PROCESS
  })

  setLocalStore(createLocalStorage(localStore))
  setSecureLocalStore(createLocalStorage(secureLocalStore))
  setSessionStore(createSessionStorage())
  setSecureSessionStore(createSessionStorage())
}

function createLocalStorage(storage: MMKV): SyncStorage {
  return createJSONStorage(() => ({
    getItem(key: string) {
      const value = storage.getString(key)
      return value !== undefined ? value : null
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    subscribe(key: string, callback: (value: string | null) => void) {
      const listener = storage.addOnValueChangedListener((changedKey) => {
        if (changedKey !== key) {
          return
        }
        const newValue = storage.getString(key)
        callback(newValue !== undefined ? newValue : null)
      })

      return () => {
        listener.remove()
      }
    }
  })) as SyncStorage
}

function createSessionStorage(): SyncStorage {
  const store = new Map<string, any>()

  return {
    getItem(key: string, initialValue: any) {
      return store.get(key) ?? initialValue
    },
    setItem(key: string, newValue: any) {
      store.set(key, newValue)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    subscribe() {
      return () => {}
    }
  }
}
