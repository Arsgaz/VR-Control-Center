import { buildDeviceAdbArgs, listAdbDevices } from './adb.service'
import type { BinaryResolver } from '@main/infrastructure/binaries/binary-resolver'
import { runCommand } from '@main/infrastructure/process/process-runner'
import { logger } from '@main/infrastructure/logging/logger'
import type { DeviceTimeSyncResult } from '@shared/contracts/headset.contracts'

const TIMEOUT_MS = 10_000
const MAX_CLOCK_DIFFERENCE_MS = 10_000

// AlarmManager.setTime returns an exception word followed by a boolean int32.
// Handle both the compact and address-prefixed multiline service CLI output.
export const didSetDeviceTime = (output: string): boolean => {
  if (/exception|permission denial|permission denied|error|not found/i.test(output)) return false
  const parcel = output.match(/Parcel\(([\s\S]*?)\)/i)?.[1]
  if (!parcel) return false
  const words = parcel
    .replace(/'[^']*'/g, '')
    .replace(/0x[0-9a-f]+:\s*/gi, '')
    .match(/\b[0-9a-f]{8}\b/gi)
  return words?.length === 2 && words[0] === '00000000' && words[1] === '00000001'
}

export const synchronizeDeviceTime = async (
  address: string,
  resolver: BinaryResolver,
  isCurrent: () => boolean = () => true
): Promise<DeviceTimeSyncResult> => {
  try {
    if (!isCurrent()) return { ok: false, code: 'SUPERSEDED' }
    const devices = await listAdbDevices(resolver)
    if (!isCurrent()) return { ok: false, code: 'SUPERSEDED' }
    if (!devices.devices.some((device) => device.serial === address && device.state === 'device')) {
      return { ok: false, code: 'NOT_CONNECTED' }
    }
    // Sample after queueing and transport discovery, immediately before sending.
    const timestampMs = Date.now()
    const result = await runCommand(
      resolver.adb(),
      buildDeviceAdbArgs(address, [
        'shell',
        'service',
        'call',
        'alarm',
        '2',
        'i64',
        String(timestampMs)
      ]),
      { timeoutMs: TIMEOUT_MS }
    )
    if (!isCurrent()) return { ok: false, code: 'SUPERSEDED' }
    const output = `${result.stdout}\n${result.stderr}`
    if (/SecurityException|permission denial|permission denied|requires.*SET_TIME/i.test(output)) {
      logger.warn('Headset time update was denied', { address, output })
      return { ok: false, code: 'PERMISSION_DENIED' }
    }
    if (result.exitCode !== 0 || !didSetDeviceTime(output)) {
      logger.warn('Headset time update was not confirmed', { address, output })
      return { ok: false, code: 'SET_FAILED' }
    }
    const verification = await runCommand(
      resolver.adb(),
      buildDeviceAdbArgs(address, ['shell', 'date', '+%s']),
      { timeoutMs: TIMEOUT_MS }
    )
    if (!isCurrent()) return { ok: false, code: 'SUPERSEDED' }
    const seconds = verification.stdout.trim()
    const deviceTimeMs = /^\d{1,12}$/.test(seconds) ? Number(seconds) * 1000 : NaN
    const computerTimeMs = Date.now()
    const differenceMs = deviceTimeMs - computerTimeMs
    if (
      verification.exitCode !== 0 ||
      !Number.isSafeInteger(deviceTimeMs) ||
      Math.abs(differenceMs) > MAX_CLOCK_DIFFERENCE_MS
    ) {
      logger.warn('Headset time verification failed', {
        address,
        stdout: verification.stdout,
        stderr: verification.stderr,
        differenceMs
      })
      return { ok: false, code: 'VERIFY_FAILED' }
    }
    logger.info('Headset time synchronized and verified', {
      address,
      computerTimeMs,
      deviceTimeMs,
      differenceMs
    })
    return { ok: true, address, computerTimeMs, deviceTimeMs, differenceMs }
  } catch (error) {
    if (!isCurrent()) return { ok: false, code: 'SUPERSEDED' }
    logger.errorWithCause('Headset time synchronization failed', error, { address })
    return { ok: false, code: 'COMMAND_FAILED' }
  }
}
