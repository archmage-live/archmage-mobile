// sort-imports-ignore

import { ethers } from 'ethers'
import crypto, { install } from 'react-native-quick-crypto'

// Add .at() method to Array if necessary (missing before iOS 15)
import './arrayAt'
// Import the Intl polyfills for Hermes
import './intl'

install()

/**
 * Ethers Polyfills
 * https://docs.ethers.org/v6/cookbook/react-native
 */

ethers.randomBytes.register((length) => {
  return new Uint8Array(crypto.randomBytes(length))
})

ethers.computeHmac.register((algo, key, data) => {
  return crypto.createHmac(algo, key).update(data).digest()
})

ethers.pbkdf2.register((passwd, salt, iter, keylen, algo) => {
  return new Uint8Array(crypto.pbkdf2Sync(passwd, salt, iter, keylen, algo))
})

ethers.sha256.register((data) => {
  return crypto.createHash('sha256').update(data).digest()
})

ethers.sha512.register((data) => {
  return crypto.createHash('sha512').update(data).digest()
})
