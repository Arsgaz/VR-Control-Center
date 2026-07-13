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

const SHORT_COMMAND_TIMEOUT_MS = 10_000

const emptyStatus = (message = 'scrcpy is not running'): ScrcpyStatus => ({
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

export const checkScrcpy = async (): Promise<ToolCheck> => {
  logger.info('Checking scrcpy availability')
  try {
    const result = await runCommand('scrcpy', ['--version'], { timeoutMs: SHORT_COMMAND_TIMEOUT_MS })
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
  private child: ChildProcessWithoutNullStreams | null = null
  private status: ScrcpyStatus = emptyStatus()

  public constructor(private readonly emit: (event: ScrcpyProcessEvent) => void) {}

  public getStatus(): ScrcpyStatus {
    return { ...this.status }
  }

  public start(options: ScrcpyStartOptions): ScrcpyStartResult {
    if (this.child && !this.child.killed) {
      logger.warn('scrcpy start rejected because a process is already running', {
        currentPid: this.status.pid,
        currentAddress: this.status.address
      })
      return {
        ok: false,
        status: this.getStatus(),
        message: 'scrcpy is already running'
      }
    }

    const args = buildScrcpyArgs(options)
    const startedAt = new Date().toISOString()
    logger.info('Starting scrcpy process', {
      address: options.address,
      args,
      noAudio: options.noAudio,
      hasCrop: Boolean(options.crop?.trim())
    })

    try {
      const child = spawn('scrcpy', args, {
        shell: false,
        windowsHide: false
      })

      this.child = child
      logger.info('scrcpy process started', {
        pid: child.pid ?? null,
        address: options.address
      })
      this.status = {
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

      child.stdout.on('data', (chunk: Buffer) => {
        const message = chunk.toString('utf8').trim() || 'scrcpy stdout'
        logger.debug('scrcpy stdout', { pid: child.pid ?? null, message })
        this.emitEvent('stdout', message)
      })

      child.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString('utf8').trim() || 'scrcpy stderr'
        logger.warn('scrcpy stderr', { pid: child.pid ?? null, message })
        this.emitEvent('stderr', message)
      })

      child.on('error', (error) => {
        logger.errorWithCause('scrcpy process emitted error', error, {
          pid: child.pid ?? null,
          address: options.address
        })
        this.child = null
        this.status = {
          ...this.status,
          state: 'error',
          running: false,
          finishedAt: new Date().toISOString(),
          message: error.message
        }
        this.emitEvent('error', error.message)
      })

      child.on('close', (exitCode, signal) => {
        const wasStopping = this.status.state === 'stopping'
        this.child = null
        this.status = {
          ...this.status,
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
        }
        logger.info(exitCode === 0 || wasStopping ? 'scrcpy process exited' : 'scrcpy process failed', {
          pid: child.pid ?? null,
          address: options.address,
          exitCode,
          signal,
          wasStopping
        })
        this.emitEvent('exit', this.status.message)
      })

      this.emitEvent('status', 'scrcpy started')

      return {
        ok: true,
        status: this.getStatus(),
        message: 'scrcpy started'
      }
    } catch (error) {
      logger.errorWithCause('Failed to spawn scrcpy process', error, {
        address: options.address,
        args
      })
      this.child = null
      this.status = {
        ...emptyStatus(errorToMessage(error)),
        state: 'error',
        finishedAt: new Date().toISOString()
      }

      return {
        ok: false,
        status: this.getStatus(),
        message: errorToMessage(error)
      }
    }
  }

  public stop(): ScrcpyStopResult {
    if (!this.child || !this.status.running) {
      logger.warn('scrcpy stop rejected because no process is running')
      return {
        ok: false,
        status: this.getStatus(),
        message: 'scrcpy is not running'
      }
    }

    logger.info('Stopping scrcpy process', { pid: this.status.pid, address: this.status.address })
    this.status = {
      ...this.status,
      state: 'stopping',
      message: 'Stopping scrcpy'
    }
    this.emitEvent('status', 'Stopping scrcpy')
    this.child.kill()

    return {
      ok: true,
      status: this.getStatus(),
      message: 'scrcpy stop requested'
    }
  }

  public stopOnShutdown(): void {
    if (this.child && this.status.running) {
      logger.info('Stopping scrcpy process during shutdown', {
        pid: this.status.pid,
        address: this.status.address
      })
      this.child.kill()
    }
  }

  private emitEvent(type: ScrcpyProcessEvent['type'], message: string): void {
    this.emit({
      type,
      message,
      status: this.getStatus(),
      occurredAt: new Date().toISOString()
    })
  }
}
