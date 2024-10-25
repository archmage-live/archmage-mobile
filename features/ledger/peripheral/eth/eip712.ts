import type { TypedDataDomain, TypedDataParameter } from 'abitype'
import { fromTwos } from 'ethers'
import { Hex, fromBytes, hashTypedData, toHex } from 'viem'

import { assert } from '@/archmage/errors'

import { RequestChecker } from '../util'
import { TokenInfoProvider } from './erc20'

export type Eip712TypedData = Parameters<typeof hashTypedData>[0]

export type SignEIP712HashedMsgRequest = {
  path: string
  domainSeparator: Hex
  hashStructMessage: Hex
}

export type SignEIP712MsgRequest = {
  path: string
  typedData: Eip712TypedData & { contractName?: string; fields: FieldValue[] }
  tokenInfoProvider: TokenInfoProvider
  legacy: boolean // ignored
}

type Field = {
  format: 'raw' | 'datetime' | 'token' | 'amount'
  sig: Hex
} & (
  | { format: 'raw' | 'datetime' | 'amount'; displayName: string }
  | { format: 'token'; displayName?: never }
) &
  (
    | { format: 'raw' | 'datetime'; deviceTokenIndex?: never }
    | { format: 'token' | 'amount'; deviceTokenIndex: number }
  )

type TypeDescriptor = {
  isCustom: boolean
  name: string
  size?: number
  arraySizes: (number | null)[]
}

type FieldValue = {
  field: Field
  value: string | number | boolean
  typeDescriptor: TypeDescriptor
}

enum ReceiveState {
  None = 0x01,
  TypeName = 0x02,
  Type = 0x04,
  FilterActivate = 0x08,
  FilterContractName = 0x10,
  FilterShowField = 0x20,
  ValueRoot = 0x40,
  ValueArray = 0x80,
  ValueFieldPartial = 0x100,
  ValueFieldComplete = 0x200
}

export class Eip712Decoder extends RequestChecker {
  private types: Record<string, TypedDataParameter[]> = {}
  private domain: TypedDataDomain = {}
  private primaryType = ''
  private message: Record<string, any> = {}
  private fields: FieldValue[] = []

  private phase = ReceiveState.None

  private typeName = ''
  private typeDescriptors: Record<string, TypeDescriptor> = {}

  private receiveValuePhase: '' | 'domain' | 'message' = ''
  private valueCache: Buffer[] = []
  private values: (Buffer | [Buffer, Field] | number)[] = [] // array of value or (value, field) or arrayLen

  private filterActivated = false
  private filterContract?: {
    displayName: string
    filtersCount: number // fields length
    sig: Hex
  }
  private filterField?: Field

  override clean() {
    super.clean()

    this.types = {}
    this.domain = {}
    this.primaryType = ''
    this.message = {}
    this.fields = []

    this.phase = ReceiveState.None

    this.typeName = ''
    this.typeDescriptors = {}

    this.receiveValuePhase = ''
    this.valueCache = []
    this.values = []

    this.filterActivated = false
    this.filterContract = undefined
    this.filterField = undefined
  }

  typedData(): Eip712TypedData & { contractName?: string; fields: FieldValue[] } {
    return {
      domain: this.domain,
      types: this.types,
      primaryType: this.primaryType,
      message: this.message,
      contractName: this.filterContract?.displayName,
      fields: this.fields
    }
  }

  assertState(previous: ReceiveState, current: ReceiveState) {
    assert(this.phase & previous, 'invalid EIP-712 receiving state')
    this.phase = current
  }

  receiveTypeName(data: Buffer) {
    this.check(true)

    this.assertState(ReceiveState.None | ReceiveState.Type, ReceiveState.TypeName)
    const structTypeName = data.toString()
    this.types[structTypeName] = []
    this.typeName = structTypeName
  }

  receiveType(data: Buffer) {
    this.check()

    this.assertState(ReceiveState.TypeName | ReceiveState.Type, ReceiveState.Type)

    const getType = (key: number, size: number = 0, name: string = '') => {
      switch (key) {
        case 0:
          assert(name, 'invalid custom type name')
          return [name]
        case 1:
          assert(size * 8 >= 8 && size * 8 <= 256, 'invalid int* type')
          return ['int', `int${size * 8}`]
        case 2:
          assert(size * 8 >= 8 && size * 8 <= 256, 'invalid uint* type')
          return ['uint', `unt${size * 8}`]
        case 3:
          return ['address']
        case 4:
          return ['bool']
        case 5:
          return ['string']
        case 6:
          assert(size >= 1 && size <= 32, 'invalid bytes* type')
          return ['bytes', `bytes${size}`]
        case 7:
          return ['bytes']
        default:
          throw new Error('invalid type key')
      }
    }

    let offset = 0
    const typeDescData = data[offset].toString(2).padStart(8, '0')
    const isTypeArray = typeDescData[0] === '1'
    const hasTypeSize = typeDescData[1] === '1'
    const typeKey = parseInt(typeDescData.slice(4), 2)
    offset += 1

    let customTypeName
    if (typeKey === 0) {
      const customTypeNameLen = data[offset]
      offset += 1
      customTypeName = data.subarray(offset, offset + customTypeNameLen).toString()
      offset += customTypeNameLen
    }

    let typeSize
    if (hasTypeSize) {
      typeSize = data[offset]
      offset += 1
    }

    const arraySizes = []
    if (isTypeArray) {
      const arraySizesNum = data[offset]
      offset += 1

      for (let arraySize = 0; arraySize < arraySizesNum; arraySize++) {
        const arrayType = data[offset]
        offset += 1

        if (arrayType === 1) {
          // fixed array
          arraySizes.push(data[offset])
          offset += 1
        } else {
          // dynamic array
          assert(arrayType === 0, 'invalid array type')
          arraySizes.push(null)
        }
      }
    }

    let [baseType, type = baseType] = getType(typeKey, typeSize, customTypeName)
    type += arraySizes.map((size) => (size === null ? '[]' : `[${size}]`)).join('')

    const nameLen = data[offset]
    offset += 1
    const name = data.subarray(offset, offset + nameLen).toString()
    offset += nameLen

    this.types[this.typeName].push({ name, type })
    this.types = sortObjectAlphabetically(this.types) as any

    // "uint8[2][][4]" => { isCustom: false, name: "uint", size: 1, arraySizes: [2, null, 4] }
    this.typeDescriptors[type] = {
      isCustom: !!customTypeName,
      name: baseType,
      size: typeSize,
      arraySizes
    }
  }

  receiveFilterActivate() {
    this.check()

    this.assertState(ReceiveState.Type, ReceiveState.FilterActivate)
    this.filterActivated = true
  }

  receiveFilterContractName(data: Buffer) {
    this.check()

    this.assertState(ReceiveState.ValueFieldComplete, ReceiveState.FilterContractName)
    assert(this.filterActivated, 'filter not activated')

    let offset = 0
    const displayNameLen = data[offset]
    offset += 1
    const displayName = data.subarray(offset, offset + displayNameLen).toString()
    offset += displayNameLen
    const filtersCount = data[offset]
    offset += 1
    const sigLen = data[offset]
    offset += 1
    const sig = toHex(data.subarray(offset, offset + sigLen))
    this.filterContract = { displayName, filtersCount, sig }
  }

  receiveFilterShowField(data: Buffer, format: 'raw' | 'datetime' | 'token' | 'amount') {
    this.check()

    this.assertState(
      ReceiveState.ValueRoot | ReceiveState.ValueArray | ReceiveState.ValueFieldComplete,
      ReceiveState.FilterShowField
    )
    assert(this.filterActivated, 'filter not activated')

    switch (format) {
      case 'raw':
      // fall through
      case 'datetime':
        {
          let offset = 0
          const displayNameLen = data[offset]
          offset += 1
          const displayName = data.subarray(offset, offset + displayNameLen).toString()
          offset += displayNameLen
          const sigLen = data[offset]
          offset += 1
          const sig = toHex(data.subarray(offset, offset + sigLen))

          this.filterField = {
            format,
            displayName,
            sig
          }
        }
        break
      case 'token':
        {
          let offset = 0
          const deviceTokenIndex = data[offset]
          offset += 1
          const sigLen = data[offset]
          offset += 1
          const sig = toHex(data.subarray(offset, offset + sigLen))

          this.filterField = {
            format,
            deviceTokenIndex,
            sig
          }
        }
        break
      case 'amount':
        {
          let offset = 0
          const displayNameLen = data[offset]
          offset += 1
          const displayName = data.subarray(offset, offset + displayNameLen).toString()
          offset += displayNameLen
          const deviceTokenIndex = data[offset]
          offset += 1
          const sigLen = data[offset]
          offset += 1
          const sig = toHex(data.subarray(offset, offset + sigLen))

          this.filterField = {
            format,
            displayName,
            deviceTokenIndex,
            sig
          }
        }
        break
      default:
        assert(false, 'invalid format')
    }
  }

  receiveValue(data: Buffer, phase: 'root' | 'array' | 'fieldPartial' | 'fieldComplete') {
    this.check()

    if (phase === 'root') {
      this.assertState(
        ReceiveState.Type | ReceiveState.FilterActivate | ReceiveState.FilterContractName,
        ReceiveState.ValueRoot
      )

      const rootType = data.toString()
      if (!this.receiveValuePhase) {
        assert(rootType === 'EIP712Domain', 'missing domain data')
        this.receiveValuePhase = 'domain'
      } else if (this.receiveValuePhase === 'domain') {
        this.decodeDomainOrMessage('EIP712Domain')

        this.receiveValuePhase = 'message'
        this.primaryType = rootType
      } else {
        assert(false, 'redundant message data')
      }
    } else if (phase === 'array') {
      this.assertState(
        ReceiveState.ValueRoot | ReceiveState.ValueArray | ReceiveState.ValueFieldComplete,
        ReceiveState.ValueArray
      )

      this.values.push(fromBytes(data, 'number'))
    } else if (phase === 'fieldPartial') {
      this.assertState(
        ReceiveState.ValueRoot |
          ReceiveState.ValueArray |
          ReceiveState.FilterShowField |
          ReceiveState.ValueFieldPartial |
          ReceiveState.ValueFieldComplete,
        ReceiveState.ValueFieldPartial
      )

      this.valueCache.push(data)
    } else if (phase === 'fieldComplete') {
      this.assertState(
        ReceiveState.ValueRoot |
          ReceiveState.ValueArray |
          ReceiveState.FilterShowField |
          ReceiveState.ValueFieldPartial |
          ReceiveState.ValueFieldComplete,
        ReceiveState.ValueFieldComplete
      )

      this.valueCache.push(data)
      const value = Buffer.concat(this.valueCache)
      this.valueCache = [] // clear

      const encodedDataLen = value.readUInt32BE()
      const encodedData = value.subarray(4)
      assert(
        encodedData.length === encodedDataLen,
        'APDU invalid encoded data length of message value of EIP-712 typed data'
      )
      if (this.filterField) {
        this.values.push([encodedData, this.filterField])
      } else {
        this.values.push(encodedData)
      }
      this.filterField = undefined
    }
  }

  decode() {
    this.decodeDomainOrMessage(this.primaryType)
    const typedData = this.typedData()

    this.clean()

    return typedData
  }

  private decodeDomainOrMessage(rootType: string) {
    const typesMap = {} as Record<string, Record<string, string>>
    for (const type in this.types) {
      typesMap[type] = this.types[type].reduce(
        (acc, curr) => ({ ...acc, [curr.name]: curr.type }),
        {}
      )
    }

    const object: Record<string, any> = {}
    for (const { name, type } of this.types[rootType]) {
      object[name] = this.decodeValue(this.typeDescriptors[type], typesMap)
    }
    assert(this.values.length === 0, 'redundant values')

    if (rootType === 'EIP712Domain') {
      this.domain = object
    } else {
      this.message = object
    }
  }

  private getValue(): [Buffer | number, Field | undefined] {
    const value = this.values[0]
    assert(value !== undefined, 'missing value')
    if (Array.isArray(value) && typeof value[0] === 'object') {
      return [value[0], value[1]]
    }
    return [value as Buffer | number, undefined]
  }

  private consumeValue() {
    this.values = this.values.slice(1)
  }

  private decodeValue(
    typeDesc: (typeof this.typeDescriptors)[keyof typeof this.typeDescriptors],
    typesMap: Record<string, Record<string, string>>,
    arraySizes?: (number | null)[]
  ): any {
    const [value, field] = this.getValue()
    if (typeof value === 'number') {
      const [currSize, ...restSizes] = arraySizes || typeDesc.arraySizes
      assert(currSize !== undefined, 'invalid array size')
      this.consumeValue()
      const array = []
      for (let i = 0; i < value; i++) {
        array.push(this.decodeValue(typeDesc, typesMap, restSizes))
      }
      return array
    }

    if (typeDesc.isCustom) {
      const object: Record<string, any> = {}
      for (const [name, type] of Object.entries(typesMap[typeDesc.name])) {
        object[name] = this.decodeValue(this.typeDescriptors[type], typesMap)
      }
      return object
    }

    this.consumeValue()

    const decodedValue = (() => {
      switch (typeDesc.name) {
        case 'int':
          return Number(fromTwos(fromBytes(value, 'bigint'), typeDesc.size! * 8))
        case 'uint':
          return fromBytes(value, 'number')
        case 'address':
          return toHex(value, { size: 20 })
        case 'bool':
          return fromBytes(value, 'number') !== 0
        case 'string':
          return value.toString()
        case 'bytes':
          return toHex(value)
        default:
          assert(false, 'invalid type')
      }
    })()

    if (field) {
      this.fields.push({
        field,
        value: decodedValue,
        typeDescriptor: typeDesc
      })
    }

    return decodedValue
  }
}

function sortObjectAlphabetically(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj).sort()

  return keys.reduce((acc, curr) => {
    const value = (() => {
      if (Array.isArray(obj[curr])) {
        return (obj[curr] as unknown[]).map((field) =>
          sortObjectAlphabetically(field as Record<string, unknown>)
        )
      }
      return obj[curr]
    })()

    ;(acc as Record<string, unknown>)[curr] = value
    return acc
  }, {})
}
