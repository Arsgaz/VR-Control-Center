import { spawn } from 'node:child_process'

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
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true
    })

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let didTimeout = false

    const timeout = setTimeout(() => {
      didTimeout = true
      child.kill()
    }, options.timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout.push(chunk)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk)
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout)

      const result = {
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      }

      if (didTimeout) {
        reject(new Error(`${executable} timed out after ${options.timeoutMs}ms`))
        return
      }

      resolve(result)
    })
  })
}
