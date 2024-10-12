import type { TypedDataDomain, TypedDataParameter } from 'abitype'
import { fromTwos } from 'ethers'
import { fromBytes, hashTypedData, toHex } from 'viem'

import { assert } from '@/archmage/errors'

export type Eip712TypedData = Parameters<typeof hashTypedData>[0]

export class Eip712Decoder {
  private types: Record<string, TypedDataParameter[]> = {}
  private domain: TypedDataDomain = {}
  private primaryType = ''
  private message: Record<string, any> = {}

  private typeName = ''

  private typeDescriptors: Record<
    string,
    { isCustom: boolean; name: string; size?: number; arraySizes: (number | null)[] }
  > = {}

  private receiveValuePhase: '' | 'domain' | 'message' = ''
  private arrayLen = 0
  private valueBuffers: Buffer[] = []
  private value = Buffer.alloc(0)
  private values: (Buffer | number)[] = []

  typedData(): Eip712TypedData {
    return {
      domain: this.domain,
      types: this.types,
      primaryType: this.primaryType,
      message: this.message
    }
  }

  receiveTypeName(data: Buffer) {
    const structTypeName = data.toString()
    this.types[structTypeName] = []
    this.typeName = structTypeName
  }

  receiveTypeDef(data: Buffer) {
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

  receiveValue(data: Buffer, phase: 'root' | 'array' | 'fieldPartial' | 'fieldComplete') {
    if (phase === 'root') {
      const rootType = data.toString()
      if (!this.receiveValuePhase) {
        assert(rootType === 'EIP712Domain', 'missing domain data')
        this.receiveValuePhase = 'domain'
      } else if (this.receiveValuePhase === 'domain') {
        this.decodeMessage('EIP712Domain')

        this.receiveValuePhase = 'message'
        this.primaryType = rootType
      } else {
        assert(false, 'redundant message data')
      }
    } else if (phase === 'array') {
      this.arrayLen = fromBytes(data, 'number')
      this.values.push(fromBytes(data, 'number'))
    } else if (phase === 'fieldPartial') {
      this.valueBuffers.push(data)
    } else if (phase === 'fieldComplete') {
      this.valueBuffers.push(data)
      const msgValueBuffer = Buffer.concat(this.valueBuffers)
      this.valueBuffers = [] // clear

      const encodedDataLen = msgValueBuffer.readUInt32BE()
      const encodedData = msgValueBuffer.subarray(4)
      assert(
        encodedData.length === encodedDataLen,
        'APDU invalid encoded data length of message value of EIP-712 typed data'
      )
      this.value = encodedData
      this.values.push(encodedData)
    }
  }

  decodeMessage(rootType: string) {
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

    if (rootType === 'EIP712Domain') {
      this.domain = object
    } else {
      this.message = object
    }
  }

  private getValue() {
    return this.values[0]
  }

  private consumeValue() {
    this.values = this.values.slice(1)
  }

  private decodeValue(
    typeDesc: (typeof this.typeDescriptors)[keyof typeof this.typeDescriptors],
    typesMap: Record<string, Record<string, string>>,
    arraySizes?: (number | null)[]
  ): any {
    const value = this.getValue()
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
