import type { SafeAccountConfig } from '@safe-global/protocol-kit'
import type { SafeVersion } from '@safe-global/types-kit'

export enum WalletType {
  HD = 'HD', // Hierarchical Deterministic, derived from mnemonic

  PRIVATE_KEY = 'PrivateKey', // private key (maybe derived from mnemonic)
  PRIVATE_KEY_GROUP = 'PrivateKeyGroup', // ditto, but in group

  HW = 'HW', // hardware
  HW_GROUP = 'HWGroup', // ditto, but in group

  ARCHMAGE_CONNECT = 'ArchmageConnect', // ArchmageConnect protocol
  ARCHMAGE_CONNECT_GROUP = 'ArchmageConnectGroup', // ditto, but in group

  WALLET_CONNECT = 'WalletConnect', // WalletConnect protocol
  WALLET_CONNECT_GROUP = 'WalletConnectGroup', // ditto, but in group

  WATCH = 'Watch', // only watch, readonly, no signing
  WATCH_GROUP = 'WatchGroup', // ditto, but in group

  MULTI_SIG = 'MultiSig', // multi-sig
  MULTI_SIG_GROUP = 'MultiSigGroup', // ditto, but in group

  KEYLESS = 'Keyless', // keyless wallet
  KEYLESS_HD = 'KeylessHD', // Hierarchical Deterministic, derived from keyless wallet private key (as seed)
  KEYLESS_GROUP = 'KeylessGroup' // ditto, but in group
}

export function isGroupWallet(wallet: { type: WalletType }) {
  switch (wallet.type) {
    case WalletType.HD:
    // pass through
    case WalletType.PRIVATE_KEY_GROUP:
    // pass through
    case WalletType.HW_GROUP:
    // pass through
    case WalletType.ARCHMAGE_CONNECT_GROUP:
    // pass through
    case WalletType.WALLET_CONNECT_GROUP:
    // pass through
    case WalletType.WATCH_GROUP:
    // pass through
    case WalletType.MULTI_SIG_GROUP:
    // pass through
    case WalletType.KEYLESS_HD:
    // pass through
    case WalletType.KEYLESS_GROUP:
      return true
    default:
      return false
  }
}

export function isKeystoreWallet(wallet: { type: WalletType }) {
  switch (wallet.type) {
    case WalletType.HD:
    // pass through
    case WalletType.PRIVATE_KEY:
    // pass through
    case WalletType.PRIVATE_KEY_GROUP:
      return true
    default:
      return false
  }
}

export function isHdWallet(wallet: { type: WalletType }) {
  switch (wallet.type) {
    case WalletType.HD:
    // pass through
    case WalletType.KEYLESS_HD:
      return true
    default:
      return false
  }
}

export function isWatchWallet(wallet: { type: WalletType }) {
  switch (wallet.type) {
    case WalletType.WATCH:
    // pass through
    case WalletType.WATCH_GROUP:
      return true
    default:
      return false
  }
}

export function isMultisigWallet(wallet: { type: WalletType }) {
  switch (wallet.type) {
    case WalletType.MULTI_SIG:
    // pass through
    case WalletType.MULTI_SIG_GROUP:
      return true
    default:
      return false
  }
}

export function isKeylessWallet(wallet: { type: WalletType }) {
  switch (wallet.type) {
    case WalletType.KEYLESS:
    // pass through
    case WalletType.KEYLESS_HD:
    // pass through
    case WalletType.KEYLESS_GROUP:
      return true
    default:
      return false
  }
}

export interface WalletInfo {
  hwType?: HardwareWalletType
  path?: string
  pathTemplate?: string
  derivePosition?: DerivePosition
  notBackedUp?: boolean
  addressType?: BtcAddressType // for Bitcoin
  multisigType?: MultisigWalletType
  accountAbstraction?: AccountAbstractionInfo
  erc4337?: Erc4337Info
  keyless?: KeylessWalletInfo
}

export enum HardwareWalletType {
  LEDGER = 'Ledger',
  TREZOR = 'Trezor',
  ONEKEY = 'OneKey'
}

// https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
// Path levels:
// m / purpose' / coin_type' / account' / change / address_index
// Generally, `address_index` will be used as derive position.
// However, you also can specify `account` or `change` as derive position.
export enum DerivePosition {
  ACCOUNT = 2,
  CHANGE = 3,
  ADDRESS_INDEX = 4
}

export enum BtcAddressType {
  LEGACY = 'Legacy', // legacy; P2PKH
  NESTED_SEGWIT = 'NestedSegWit', // SegWit; P2SH; P2WPKH-nested-in-P2SH
  NATIVE_SEGWIT = 'NativeSegWit', // Native SegWit; bech32; P2WPKH
  TAPROOT = 'Taproot' // Taproot; bech32m; P2TR
}

export enum MultisigWalletType {
  SAFE = 'safe'
}

export enum AccountAbstractionType {
  ERC4337 = 'erc4337',
  SAFE = 'safe'
}

export interface AccountAbstractionInfo {
  type: AccountAbstractionType
}

// Info of ERC4337 based account abstraction
export interface Erc4337Info {}

// info of Safe{Core} Protocol based account abstraction
export interface SafeInfo {
  safeVersion: SafeVersion
  threshold: number
  owners: SafeOwner[]
  setupConfig: Omit<SafeAccountConfig, 'threshold' | 'owners'>
  saltNonce?: string // uint256 string or its hex string; may be not found for imported Safe Account
  isL1SafeMasterCopy?: boolean
}

export interface SafeOwner {
  name: string
  address: string // ethereum address
  associated?: AccountIndex
}

export interface AccountIndex {
  masterId: number
  index: number
}

export enum KeylessWalletType {
  WEB3AUTH = 'Web3Auth'
}

export interface KeylessWalletInfo {
  type: KeylessWalletType
  loginProvider: string
  name: string
  imageUrl?: string
}
