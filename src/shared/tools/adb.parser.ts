import type { AdbDevice, AdbDeviceState } from '../contracts/headset.contracts'

const knownStates = new Set<AdbDeviceState>(['device', 'offline', 'unauthorized'])

export const parseAdbDevices = (stdout: string): AdbDevice[] => {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('List of devices attached'))
    .map((line) => {
      const [serial = '', rawState = 'unknown'] = line.split(/\s+/)
      const state = knownStates.has(rawState as AdbDeviceState)
        ? (rawState as AdbDeviceState)
        : 'unknown'

      const model = /\bmodel:(\S+)/.exec(line)?.[1]?.replaceAll('_', ' ')
      return {
        ...(model ? { model } : {}),
        serial,
        state,
        rawState
      }
    })
    .filter((device) => device.serial.length > 0)
}
