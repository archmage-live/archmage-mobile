import { StatusCodes } from '@ledgerhq/errors'

import {
  APDU,
  App,
  AppVersion,
  BaseLedgerBlePeripheral,
  BatteryStatusTypes,
  Constant,
  LedgerOS,
  LedgerOSVersion,
  bufferStatusCode
} from './peripheral'

export default async function handleCmdRequest(peripheral: BaseLedgerBlePeripheral, apdu: APDU) {
  const [cla, ins, p1, p2, data] = apdu

  switch (cla) {
    case Constant.CLA_B0:
      if (ins === Constant.INS_01 && p1 === Constant.P1_00 && p2 === Constant.P2_00) {
        // getAppAndVersion
        // https://developers.ledger.com/docs/connectivity/ledgerJS/open-close-info-on-apps#get-information

        const name = peripheral.app || LedgerOS
        let version = LedgerOSVersion
        switch (name) {
          case App.Bitcoin:
            version = AppVersion.Bitcoin
            break
          case App.Ethereum:
            version = AppVersion.Ethereum
            break
          case App.Solana:
            version = AppVersion.Solana
            break
          case App.Cosmos:
            version = AppVersion.Cosmos
            break
          case App.Aptos:
            version = AppVersion.Aptos
            break
          case App.Sui:
            version = AppVersion.Sui
            break
          case App.Tron:
            version = AppVersion.Tron
            break
        }

        const format = 1
        const flags: number[] = []
        await peripheral.send(
          Buffer.concat([
            Buffer.from([format, name.length]),
            Buffer.from(name),
            Buffer.from([version.length]),
            Buffer.from(version),
            Buffer.from([flags.length]),
            Buffer.from(flags),
            bufferStatusCode(StatusCodes.OK)])
        )
      } else if (ins === Constant.INS_A7 && p1 === Constant.P1_00 && p2 === Constant.P2_00) {
        // quitApp
        // https://developers.ledger.com/docs/connectivity/ledgerJS/open-close-info-on-apps#quit-application
        // Does not require any operation from the user, and operates silently.
        peripheral.exitApp()
        await peripheral.send(Buffer.from([0x90, 0x00]))
      }
      break
    case Constant.CLA_E0:
      if (ins === Constant.INS_10 && p1 === Constant.P1_00) {
        // getBatteryStatus
        switch (p2) {
          case BatteryStatusTypes.BATTERY_PERCENTAGE:
            await peripheral.send(
              Buffer.concat([Buffer.from([100]), bufferStatusCode(StatusCodes.OK)])
            )
            break
          case BatteryStatusTypes.BATTERY_VOLTAGE:
            await peripheral.send(
              Buffer.concat([Buffer.from([0, 30]), bufferStatusCode(StatusCodes.OK)])
            )
            break
          case BatteryStatusTypes.BATTERY_TEMPERATURE:
          // pass through
          case BatteryStatusTypes.BATTERY_CURRENT:
            await peripheral.send(
              Buffer.concat([Buffer.from([30]), bufferStatusCode(StatusCodes.OK)])
            )
            break
          case BatteryStatusTypes.BATTERY_FLAGS:
            await peripheral.send(
              Buffer.concat([Buffer.from([0, 0, 0, 0]), bufferStatusCode(StatusCodes.OK)])
            )
            break
          default:
            await peripheral.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
            break
        }
      } else if (p1 === Constant.P1_00 && p2 === Constant.P2_00) {
        switch (ins) {
          case Constant.INS_01:
            // getVersion
            await peripheral.send(
              Buffer.from([
                /* targetId */
                0x30,
                0x00,
                0x00,
                0x00,
                /* rawVersionLength */
                0,
                /* flagsLength */
                0
              ])
            )
            break
          case Constant.INS_D8:
            // openApp
            // https://developers.ledger.com/docs/connectivity/ledgerJS/open-close-info-on-apps#open-application
            const name = Buffer.from(data || []).toString('ascii')
            if (!name) {
              await peripheral.send(Buffer.from([0x67, 0x0a]))
            } else {
              // TODO: request user consent
              try {
                peripheral.enterApp(name)
                await peripheral.send(Buffer.from([0x90, 0x00]))
              } catch {
                await peripheral.send(Buffer.from([0x68, 0x07]))
              }
            }
            break
          case Constant.INS_D4:
            // editDeviceName
            await peripheral.send(bufferStatusCode(StatusCodes.USER_REFUSED_ON_DEVICE))
            break
          default:
            await peripheral.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
            break
        }
      }
      break
    default:
      await peripheral.send(bufferStatusCode(StatusCodes.UNKNOWN_APDU))
      break
  }
}
