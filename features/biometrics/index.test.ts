import { authenticateAsync, hasHardwareAsync, isEnrolledAsync } from 'expo-local-authentication'

import { BiometricAuthenticationStatus, tryLocalAuthenticate } from '.'

jest.mock('expo-local-authentication')

const mockedHasHardwareAsync = hasHardwareAsync as jest.MockedFunction<typeof hasHardwareAsync>
const mockedIsEnrolledAsync = isEnrolledAsync as jest.MockedFunction<typeof isEnrolledAsync>
const mockedAuthenticateAsync = authenticateAsync as jest.MockedFunction<typeof authenticateAsync>

describe(tryLocalAuthenticate, () => {
  it('checks hardware compatibility', async () => {
    mockedHasHardwareAsync.mockResolvedValue(false)

    const status = await tryLocalAuthenticate()

    expect(status).toEqual(BiometricAuthenticationStatus.Unsupported)
  })

  it('checks enrollement', async () => {
    mockedHasHardwareAsync.mockResolvedValue(true)
    mockedIsEnrolledAsync.mockResolvedValue(false)
    mockedAuthenticateAsync.mockResolvedValue({ success: false, error: '' })

    const status = await tryLocalAuthenticate()

    expect(status).toEqual(BiometricAuthenticationStatus.MissingEnrollment)
  })

  it('fails to authenticate when user rejects', async () => {
    mockedHasHardwareAsync.mockResolvedValue(true)
    mockedIsEnrolledAsync.mockResolvedValue(true)
    mockedAuthenticateAsync.mockResolvedValue({ success: false, error: '' })

    const status = await tryLocalAuthenticate()

    expect(status).toEqual(BiometricAuthenticationStatus.Rejected)
  })

  it('authenticates when user accepts', async () => {
    mockedHasHardwareAsync.mockResolvedValue(true)
    mockedIsEnrolledAsync.mockResolvedValue(true)
    mockedAuthenticateAsync.mockResolvedValue({ success: true })

    const status = await tryLocalAuthenticate()

    expect(status).toEqual(BiometricAuthenticationStatus.Authenticated)
  })

  it('always return authenticated when disabled', async () => {
    const status = await tryLocalAuthenticate()

    expect(status).toEqual(BiometricAuthenticationStatus.Authenticated)
  })
})
