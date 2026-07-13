import { parseAdbDevices } from '../../shared/tools/adb.parser'
import type {
  AdbCommandResult,
  AdbDevicesResult,
  ToolCheck
} from '../../shared/contracts/headset.contracts'
import { runCommand } from './process-runner'
import { logger } from '../logger/logger'

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

export const checkAdb = async (): Promise<ToolCheck> => {
  logger.info('Checking ADB availability')
  try {
    const result = await runCommand('adb', ['version'], { timeoutMs: SHORT_COMMAND_TIMEOUT_MS })
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

export const listAdbDevices = async (): Promise<AdbDevicesResult> => {
  logger.info('Listing ADB devices')
  const result = await runCommand('adb', ['devices'], { timeoutMs: SHORT_COMMAND_TIMEOUT_MS })

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

export const connectAdbDevice = async (address: string): Promise<AdbCommandResult> => {
  logger.info('Connecting ADB device', { address })
  const result = await runCommand('adb', ['connect', address], { timeoutMs: SHORT_COMMAND_TIMEOUT_MS })
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

export const disconnectAdbDevice = async (address: string): Promise<AdbCommandResult> => {
  logger.info('Disconnecting ADB device', { address })
  const result = await runCommand('adb', ['disconnect', address], {
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
