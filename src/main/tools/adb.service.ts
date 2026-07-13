import { parseAdbDevices } from '../../shared/tools/adb.parser'
import { parseBatteryDumpsys } from '../../shared/tools/battery.parser'
import {
  parseForegroundFromActivityDumpsys,
  parseForegroundFromWindowDumpsys
} from '../../shared/tools/foreground.parser'
import type {
  AdbCommandResult,
  AdbDevicesResult,
  DeviceRuntimeState,
  ToolCheck
} from '../../shared/contracts/headset.contracts'
import { runCommand } from './process-runner'
import { logger } from '../logger/logger'
import { systemBinaryResolver, type BinaryResolver } from './binary-resolver'

const SHORT_COMMAND_TIMEOUT_MS = 10_000

const errorToMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown process error'
}

const firstNonEmptyLine = (value: string): string | null => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null
}

export const buildDeviceAdbArgs = (address: string, args: string[]): string[] => {
  return ['-s', address, ...args]
}

export const checkAdb = async (
  binaryResolver: BinaryResolver = systemBinaryResolver
): Promise<ToolCheck> => {
  logger.info('Checking ADB availability')
  try {
    const result = await runCommand(binaryResolver.adb(), ['version'], {
      timeoutMs: SHORT_COMMAND_TIMEOUT_MS
    })
    const version = firstNonEmptyLine(result.stdout)
    const available = result.exitCode === 0

    logger.info('ADB availability check completed', {
      available,
      version,
      exitCode: result.exitCode,
      stderr: result.stderr
    })
    return {
      name: 'adb',
      available,
      version,
      message: available ? 'ADB is available' : 'ADB returned a non-zero exit code',
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
    logger.errorWithCause('ADB availability check failed', error)
    return {
      name: 'adb',
      available: false,
      version: null,
      message: errorToMessage(error),
      stdout: '',
      stderr: ''
    }
  }
}

export const listAdbDevices = async (
  binaryResolver: BinaryResolver = systemBinaryResolver
): Promise<AdbDevicesResult> => {
  logger.info('Listing ADB devices')
  const result = await runCommand(binaryResolver.adb(), ['devices', '-l'], {
    timeoutMs: SHORT_COMMAND_TIMEOUT_MS
  })

  if (result.exitCode !== 0) {
    logger.warn('ADB devices returned a non-zero exit code', {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    })
    throw new Error(result.stderr.trim() || 'ADB devices returned a non-zero exit code')
  }

  const devices = parseAdbDevices(result.stdout)
  logger.info('ADB devices parsed', {
    count: devices.length,
    states: devices.map((device) => device.rawState)
  })
  return {
    devices,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

export const connectAdbDevice = async (
  address: string,
  binaryResolver: BinaryResolver = systemBinaryResolver
): Promise<AdbCommandResult> => {
  logger.info('Connecting ADB device', { address })
  const result = await runCommand(binaryResolver.adb(), ['connect', address], {
    timeoutMs: SHORT_COMMAND_TIMEOUT_MS
  })
  const output = `${result.stdout}\n${result.stderr}`.trim()
  const ok =
    result.exitCode === 0 &&
    (output.includes(`connected to ${address}`) || output.includes(`already connected to ${address}`))

  logger.info('ADB connect completed', {
    address,
    ok,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  })
  return {
    ok,
    message: output || (ok ? 'ADB connected' : 'ADB connect did not confirm a connection'),
    stdout: result.stdout,
    stderr: result.stderr
  }
}

export const disconnectAdbDevice = async (
  address: string,
  binaryResolver: BinaryResolver = systemBinaryResolver
): Promise<AdbCommandResult> => {
  logger.info('Disconnecting ADB device', { address })
  const result = await runCommand(binaryResolver.adb(), ['disconnect', address], {
    timeoutMs: SHORT_COMMAND_TIMEOUT_MS
  })
  const output = `${result.stdout}\n${result.stderr}`.trim()
  const ok = result.exitCode === 0 && !output.toLowerCase().includes('error')

  logger.info('ADB disconnect completed', {
    address,
    ok,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  })
  return {
    ok,
    message: output || (ok ? 'ADB disconnected' : 'ADB disconnect returned an error'),
    stdout: result.stdout,
    stderr: result.stderr
  }
}

export const getDeviceBattery = async (
  address: string,
  binaryResolver: BinaryResolver = systemBinaryResolver
): Promise<
  Pick<
    DeviceRuntimeState,
    | 'batteryLevel'
    | 'batteryStatus'
    | 'isCharging'
    | 'batteryTemperatureCelsius'
    | 'batteryVoltageMillivolts'
  >
> => {
  const args = buildDeviceAdbArgs(address, ['shell', 'dumpsys', 'battery'])
  const result = await runCommand(binaryResolver.adb(), args, { timeoutMs: SHORT_COMMAND_TIMEOUT_MS })

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'ADB battery command failed')
  }

  const battery = parseBatteryDumpsys(result.stdout)
  return {
    batteryLevel: battery.level,
    batteryStatus: battery.status,
    isCharging: battery.isCharging,
    batteryTemperatureCelsius: battery.temperatureCelsius,
    batteryVoltageMillivolts: battery.voltageMillivolts
  }
}

export const getForegroundApplication = async (
  address: string,
  binaryResolver: BinaryResolver = systemBinaryResolver
): Promise<
  Pick<
    DeviceRuntimeState,
    'foregroundPackage' | 'foregroundActivity' | 'foregroundApplicationName'
  >
> => {
  const activityResult = await runCommand(
    binaryResolver.adb(),
    buildDeviceAdbArgs(address, ['shell', 'dumpsys', 'activity', 'activities']),
    { timeoutMs: SHORT_COMMAND_TIMEOUT_MS }
  )

  if (activityResult.exitCode === 0) {
    const foreground = parseForegroundFromActivityDumpsys(activityResult.stdout)
    if (foreground.packageName) {
      return {
        foregroundPackage: foreground.packageName,
        foregroundActivity: foreground.activityName,
        foregroundApplicationName: foreground.packageName
      }
    }
  }

  const windowResult = await runCommand(
    binaryResolver.adb(),
    buildDeviceAdbArgs(address, ['shell', 'dumpsys', 'window', 'windows']),
    { timeoutMs: SHORT_COMMAND_TIMEOUT_MS }
  )

  if (windowResult.exitCode !== 0) {
    throw new Error(windowResult.stderr.trim() || 'ADB foreground command failed')
  }

  const foreground = parseForegroundFromWindowDumpsys(windowResult.stdout)
  return {
    foregroundPackage: foreground.packageName,
    foregroundActivity: foreground.activityName,
    foregroundApplicationName: foreground.packageName
  }
}
