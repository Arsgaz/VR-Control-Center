import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { buildScrcpyArgs } from '../../shared/tools/scrcpy.args'
import type {
  ScrcpyProcessEvent,
  ScrcpyStartOptions,
  ScrcpyStartResult,
  ScrcpyStatus,
  ScrcpyStopResult,
  ToolCheck
} from '../../shared/contracts/headset.contracts'
import { runCommand } from './process-runner'
import { logger } from '../logger/logger'
import { systemBinaryResolver, type BinaryResolver } from './binary-resolver'

const SHORT_COMMAND_TIMEOUT_MS = 10_000

interface ScrcpySession {
  child: ChildProcessWithoutNullStreams
  status: ScrcpyStatus
}

const emptyStatus = (
  deviceId: string | null,
  message = 'scrcpy is not running'
): ScrcpyStatus => ({
  deviceId,
  state: 'stopped',
  running: false,
  pid: null,
  address: null,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  signal: null,
  message
})

const firstNonEmptyLine = (value: string): string | null => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null
}

const errorToMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown process error'
}

export const checkScrcpy = async (
  binaryResolver: BinaryResolver = systemBinaryResolver
): Promise<ToolCheck> => {
  logger.info('Checking scrcpy availability')
  try {
    const result = await runCommand(binaryResolver.scrcpy(), ['--version'], {
      timeoutMs: SHORT_COMMAND_TIMEOUT_MS
    })
    const version = firstNonEmptyLine(result.stdout || result.stderr)
    const available = result.exitCode === 0

    logger.info('scrcpy availability check completed', {
      available,
      version,
      exitCode: result.exitCode,
      stderr: result.stderr
    })
    return {
      name: 'scrcpy',
      available,
      version,
      message: available ? 'scrcpy is available' : 'scrcpy returned a non-zero exit code',
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
    logger.errorWithCause('scrcpy availability check failed', error)
    return {
      name: 'scrcpy',
      available: false,
      version: null,
      message: errorToMessage(error),
      stdout: '',
      stderr: ''
    }
  }
}

export class ScrcpyService {
  private readonly sessions = new Map<string, ScrcpySession>()
  private readonly lastStatuses = new Map<string, ScrcpyStatus>()

  public constructor(
    private readonly emit: (event: ScrcpyProcessEvent) => void,
    private binaryResolver: BinaryResolver = systemBinaryResolver
  ) {}

  public setBinaryResolver(binaryResolver: BinaryResolver): void {
    this.binaryResolver = binaryResolver
  }

  public getStatus(deviceId: string): ScrcpyStatus {
    return this.sessions.get(deviceId)?.status ?? this.lastStatuses.get(deviceId) ?? emptyStatus(deviceId)
  }

  public start(deviceId: string, options: ScrcpyStartOptions): ScrcpyStartResult {
    const existing = this.sessions.get(deviceId)
    if (existing && !existing.child.killed) {
      logger.warn('scrcpy start rejected because a device session is already running', {
        deviceId,
        currentPid: existing.status.pid,
        currentAddress: existing.status.address
      })
      return {
        ok: false,
        status: this.getStatus(deviceId),
        message: 'scrcpy is already running for this device'
      }
    }

    const args = buildScrcpyArgs(options)
    const startedAt = new Date().toISOString()
    logger.info('Starting scrcpy process', {
      deviceId,
      address: options.address,
      args,
      noAudio: options.noAudio,
      hasCrop: Boolean(options.crop?.trim())
    })

    try {
      const child = spawn(this.binaryResolver.scrcpy(), args, {
        shell: false,
        windowsHide: false
      })

      const status: ScrcpyStatus = {
        deviceId,
        state: 'running',
        running: true,
        pid: child.pid ?? null,
        address: options.address,
        startedAt,
        finishedAt: null,
        exitCode: null,
        signal: null,
        message: 'scrcpy is running'
      }
      this.sessions.set(deviceId, { child, status })
      this.lastStatuses.set(deviceId, status)

      logger.info('scrcpy process started', {
        deviceId,
        pid: child.pid ?? null,
        address: options.address
      })

      child.stdout.on('data', (chunk: Buffer) => {
        const message = chunk.toString('utf8').trim() || 'scrcpy stdout'
        logger.debug('scrcpy stdout', { deviceId, pid: child.pid ?? null, message })
        this.emitEvent(deviceId, 'stdout', message)
      })

      child.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString('utf8').trim() || 'scrcpy stderr'
        logger.warn('scrcpy stderr', { deviceId, pid: child.pid ?? null, message })
        this.emitEvent(deviceId, 'stderr', message)
      })

      child.on('error', (error) => {
        logger.errorWithCause('scrcpy process emitted error', error, {
          deviceId,
          pid: child.pid ?? null,
          address: options.address
        })
        this.updateStatus(deviceId, {
          state: 'error',
          running: false,
          finishedAt: new Date().toISOString(),
          message: error.message
        })
        this.sessions.delete(deviceId)
        this.emitEvent(deviceId, 'error', error.message)
      })

      child.on('close', (exitCode, signal) => {
        const currentStatus = this.getStatus(deviceId)
        const wasStopping = currentStatus.state === 'stopping'
        this.updateStatus(deviceId, {
          state: wasStopping || exitCode === 0 ? 'exited' : 'error',
          running: false,
          finishedAt: new Date().toISOString(),
          exitCode,
          signal,
          message:
            wasStopping
              ? 'scrcpy stopped'
              : exitCode === 0
                ? 'scrcpy exited'
                : `scrcpy exited with code ${exitCode ?? 'unknown'}`
        })
        this.sessions.delete(deviceId)
        logger.info(exitCode === 0 || wasStopping ? 'scrcpy process exited' : 'scrcpy process failed', {
          deviceId,
          pid: child.pid ?? null,
          address: options.address,
          exitCode,
          signal,
          wasStopping
        })
        this.emitEvent(deviceId, 'exit', this.getStatus(deviceId).message)
      })

      this.emitEvent(deviceId, 'status', 'scrcpy started')

      return {
        ok: true,
        status: this.getStatus(deviceId),
        message: 'scrcpy started'
      }
    } catch (error) {
      logger.errorWithCause('Failed to spawn scrcpy process', error, {
        deviceId,
        address: options.address,
        args
      })
      const status = {
        ...emptyStatus(deviceId, errorToMessage(error)),
        state: 'error' as const,
        address: options.address,
        finishedAt: new Date().toISOString()
      }
      this.lastStatuses.set(deviceId, status)

      return {
        ok: false,
        status,
        message: errorToMessage(error)
      }
    }
  }

  public stop(deviceId: string): ScrcpyStopResult {
    const session = this.sessions.get(deviceId)
    if (!session || !session.status.running) {
      logger.warn('scrcpy stop rejected because no device process is running', { deviceId })
      return {
        ok: false,
        status: this.getStatus(deviceId),
        message: 'scrcpy is not running for this device'
      }
    }

    logger.info('Stopping scrcpy process', {
      deviceId,
      pid: session.status.pid,
      address: session.status.address
    })
    this.updateStatus(deviceId, {
      state: 'stopping',
      message: 'Stopping scrcpy'
    })
    this.emitEvent(deviceId, 'status', 'Stopping scrcpy')
    session.child.kill()

    return {
      ok: true,
      status: this.getStatus(deviceId),
      message: 'scrcpy stop requested'
    }
  }

  public stopOnShutdown(): void {
    for (const [deviceId, session] of this.sessions) {
      if (session.status.running) {
        logger.info('Stopping scrcpy process during shutdown', {
          deviceId,
          pid: session.status.pid,
          address: session.status.address
        })
        session.child.kill()
      }
    }
  }

  private updateStatus(deviceId: string, changes: Partial<ScrcpyStatus>): void {
    const nextStatus = {
      ...this.getStatus(deviceId),
      ...changes
    }
    const session = this.sessions.get(deviceId)
    if (session) {
      session.status = nextStatus
    }
    this.lastStatuses.set(deviceId, nextStatus)
  }

  private emitEvent(
    deviceId: string,
    type: ScrcpyProcessEvent['type'],
    message: string
  ): void {
    this.emit({
      type,
      deviceId,
      message,
      status: this.getStatus(deviceId),
      occurredAt: new Date().toISOString()
    })
  }
}
