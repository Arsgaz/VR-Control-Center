import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from '@main/infrastructure/process/process-runner'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
const createChild = () =>
  Object.assign(new EventEmitter(), {
    pid: 42 as number | undefined,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
    unref: vi.fn()
  })
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('Short-lived command deadlines', () => {
  it('collects output and cancels termination timers on normal exit', async () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const running = runCommand('adb', ['devices'], { timeoutMs: 1000 })
    child.stdout.write('device')
    child.emit('close', 0, null)
    expect(await running).toMatchObject({ stdout: 'device', exitCode: 0 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('rejects within a bounded grace period even if kill produces no close', async () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const running = runCommand('adb', ['connect', '10.0.0.1:5555'], { timeoutMs: 1000 })
    const failed = expect(running).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(1000)
    expect(child.kill).toHaveBeenCalledWith()
    await vi.advanceTimersByTimeAsync(1000)
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL')
    // An OS error does not cancel the deadline for a live child.
    child.emit('error', new Error('EPERM'))
    await vi.advanceTimersByTimeAsync(1000)
    await failed
    expect(child.unref).toHaveBeenCalledOnce()
    child.emit('close', 0, null)
  })

  it('does not let an old timeout kill anything after an early close', async () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const failed = expect(runCommand('adb', [], { timeoutMs: 1000 })).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(1000)
    child.emit('close', null, 'SIGTERM')
    await failed
    await vi.advanceTimersByTimeAsync(5000)
    expect(child.kill).toHaveBeenCalledTimes(1)
  })
})
