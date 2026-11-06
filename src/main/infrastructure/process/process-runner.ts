import { spawn } from 'node:child_process'
import { logger } from '@main/infrastructure/logging/logger'

export interface RunCommandOptions {
  timeoutMs: number
}

export interface RunCommandResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export const runCommand = (
  executable: string,
  args: string[],
  options: RunCommandOptions
): Promise<RunCommandResult> => {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    logger.debug('Starting short-lived command', { executable, args, timeoutMs: options.timeoutMs })
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true
    })

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let didTimeout = false
    let settled = false
    let forceKillTimer: NodeJS.Timeout | undefined
    let deadline: NodeJS.Timeout | undefined
    const timeoutError = () => new Error(`${executable} timed out after ${options.timeoutMs}ms`)
    const cleanup = (): void => {
      clearTimeout(timeout)
      clearTimeout(forceKillTimer)
      clearTimeout(deadline)
    }

    const timeout = setTimeout(() => {
      didTimeout = true
      // Normally close settles the command. Bound the wait even if close never arrives.
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 1_000)
      deadline = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        child.stdout?.destroy()
        child.stderr?.destroy()
        child.unref()
        reject(timeoutError())
      }, 2_000)
      child.kill()
    }, options.timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (!settled) stdout.push(chunk)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      if (!settled) stderr.push(chunk)
    })

    child.on('error', (error) => {
      // kill errors do not imply that an already-spawned process has exited.
      if (didTimeout && child.pid !== undefined) return
      if (settled) return
      settled = true
      cleanup()
      logger.errorWithCause('Short-lived command failed to start', error, { executable, args })
      reject(error)
    })

    child.on('close', (exitCode, signal) => {
      if (settled) return
      settled = true
      cleanup()

      const result = {
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      }

      if (didTimeout) {
        const error = timeoutError()
        logger.warn('Short-lived command timed out', {
          executable,
          args,
          durationMs: Date.now() - startedAt,
          stdout: result.stdout,
          stderr: result.stderr
        })
        reject(error)
        return
      }

      logger.debug('Short-lived command completed', {
        executable,
        args,
        durationMs: Date.now() - startedAt,
        exitCode,
        signal,
        stdout: result.stdout,
        stderr: result.stderr
      })
      resolve(result)
    })
  })
}
