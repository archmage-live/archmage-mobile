import { trimToLength } from '@/archmage/primitives/string'

export class PlatformSplitStubError extends Error {
  constructor(functionName: string) {
    super(`${functionName} not implemented. Did you forget a platform override?`)
    this.name = this.constructor.name
  }
}

export class NotImplementedError extends Error {
  constructor(functionName: string) {
    super(`${functionName} is not implemented on this platform.`)
    this.name = this.constructor.name
  }
}

export function assert(predicate: unknown, errorMessage: string = ''): asserts predicate {
  if (!predicate) {
    throw new Error(errorMessage)
  }
}

export function errorToString(error: unknown, maxLength = 240): string {
  let errorMessage
  if (error instanceof Error) {
    errorMessage = error.message
  } else if (typeof error === 'string') {
    errorMessage = error
  } else if (typeof error === 'number') {
    errorMessage = `Error code: ${error}`
  } else {
    errorMessage = JSON.stringify(error)
  }

  return trimToLength(errorMessage, maxLength)
}
