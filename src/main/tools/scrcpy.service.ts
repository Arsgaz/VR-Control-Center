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
  try {
    const result = await runCommand('scrcpy', ['--version'], { timeoutMs: SHORT_COMMAND_TIMEOUT_MS })
    const version = firstNonEmptyLine(result.stdout || result.stderr)
    const available = result.exitCode === 0

    return {
      name: 'scrcpy',
      available,
      version,
      message: available ? 'scrcpy is available' : 'scrcpy returned a non-zero exit code',
      stdout: result.stdout,
      stderr: result.stderr
    }
  } catch (error) {
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
      return {
        ok: false,
        status: this.getStatus(),
        message: 'scrcpy is already running'
      }
    }

    const args = buildScrcpyArgs(options)
    const startedAt = new Date().toISOString()

    try {
      const child = spawn('scrcpy', args, {
        shell: false,
        windowsHide: false
      })

      this.child = child
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
        this.emitEvent('stdout', chunk.toString('utf8').trim() || 'scrcpy stdout')
      })

      child.stderr.on('data', (chunk: Buffer) => {
        this.emitEvent('stderr', chunk.toString('utf8').trim() || 'scrcpy stderr')
      })

      child.on('error', (error) => {
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
        this.emitEvent('exit', this.status.message)
      })

      this.emitEvent('status', 'scrcpy started')

      return {
        ok: true,
        status: this.getStatus(),
        message: 'scrcpy started'
      }
    } catch (error) {
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
      return {
        ok: false,
        status: this.getStatus(),
        message: 'scrcpy is not running'
      }
    }

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
