import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const createChild = () =>
  Object.assign(new EventEmitter(), {
    pid: 42 as number | undefined,
    killed: false,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(function (this: { killed: boolean }) {
      this.killed = true
      return true
    })
  })
const options = { address: '10.0.0.1:5555', noAudio: true }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('ScrcpyService process lifecycle', () => {
  it('pins the bundled Android server to the selected client version', () => {
    vi.mocked(spawn).mockReturnValueOnce(createChild() as never)
    const service = new ScrcpyService(vi.fn(), {
      adb: () => '/bundle/adb.exe',
      scrcpy: () => '/bundle/scrcpy.exe',
      scrcpyServer: () => '/bundle/scrcpy-server'
    })
    service.start('a', options)
    expect(spawn).toHaveBeenCalledWith(
      '/bundle/scrcpy.exe',
      expect.anything(),
      expect.objectContaining({
        env: expect.objectContaining({
          ADB: '/bundle/adb.exe',
          SCRCPY_SERVER_PATH: '/bundle/scrcpy-server'
        })
      })
    )
  })
  it('keeps a stopping session reserved until close, then allows restart', () => {
    const first = createChild()
    const second = createChild()
    vi.mocked(spawn)
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never)
    const service = new ScrcpyService(vi.fn())
    expect(service.start('a', options).status.state).toBe('starting')
    first.emit('spawn')
    expect(service.getStatus('a').state).toBe('running')
    service.stop('a')
    expect(first.kill).toHaveBeenCalledOnce()
    expect(service.start('a', options).ok).toBe(false)
    first.emit('close', null, 'SIGTERM')
    expect(service.getStatus('a').state).toBe('exited')
    expect(service.start('a', options).ok).toBe(true)
    first.emit('close', 1, null)
    expect(service.getStatus('a').state).toBe('starting')
  })

  it('ignores close from a failed process after another session starts', () => {
    const first = createChild()
    const second = createChild()
    vi.mocked(spawn)
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never)
    const service = new ScrcpyService(vi.fn())
    service.start('a', options)
    first.pid = undefined // A failed spawn has no OS process id.
    first.emit('error', new Error('ENOENT'))
    expect(service.getStatus('a').message).toBe('ENOENT')
    service.start('a', options)
    second.emit('spawn')
    first.emit('close', -2, null)
    expect(service.getStatus('a').state).toBe('running')
    expect(service.stop('a').ok).toBe(true)
    expect(second.kill).toHaveBeenCalledOnce()
  })

  it('starts and stops independent device sessions', () => {
    const first = createChild()
    const second = createChild()
    vi.mocked(spawn)
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never)
    const service = new ScrcpyService(vi.fn())
    expect(service.start('a', options).ok).toBe(true)
    expect(service.start('b', { ...options, address: '10.0.0.2:5555' }).ok).toBe(true)
    service.stop('a')
    expect(second.kill).not.toHaveBeenCalled()
    expect(service.getStatus('b').running).toBe(true)
  })

  it('passes the configured ADB executable to scrcpy', () => {
    vi.mocked(spawn).mockReturnValueOnce(createChild() as never)
    const service = new ScrcpyService(vi.fn(), {
      adb: () => '/custom/adb',
      scrcpy: () => '/custom/scrcpy'
    })
    service.start('a', options)
    expect(spawn).toHaveBeenCalledWith(
      '/custom/scrcpy',
      expect.arrayContaining(['--serial', options.address]),
      expect.objectContaining({ env: expect.objectContaining({ ADB: '/custom/adb' }) })
    )
  })

  it('waits for close and cancels forced termination after a graceful stop', async () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const service = new ScrcpyService(vi.fn())
    service.start('a', options)
    const stopping = service.stopAndWait('a')
    child.emit('close', 0, null)
    expect((await stopping).ok).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('forces a slow process to stop, but keeps its slot until close', async () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const service = new ScrcpyService(vi.fn())
    service.start('a', options)
    const stopping = service.stopAndWait('a')
    await vi.advanceTimersByTimeAsync(2000)
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL')
    expect(service.start('a', options).ok).toBe(false)
    child.emit('close', null, 'SIGKILL')
    expect((await stopping).ok).toBe(true)
    expect(service.getStatus('a').running).toBe(false)
  })

  it('bounds the wait and does not spawn a duplicate if the OS never reports close', async () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const service = new ScrcpyService(vi.fn())
    service.start('a', options)
    const stopping = service.stopAndWait('a')
    await vi.advanceTimersByTimeAsync(5000)
    expect((await stopping).ok).toBe(false)
    expect(service.start('a', options).ok).toBe(false)
    child.emit('close', 0, null)
    expect(service.getStatus('a').running).toBe(false)
  })

  it('does not release a live session on an error terminating the process', () => {
    const child = createChild()
    vi.mocked(spawn).mockReturnValueOnce(child as never)
    const service = new ScrcpyService(vi.fn())
    service.start('a', options)
    service.stop('a')
    child.emit('error', new Error('EPERM'))
    expect(service.getStatus('a').running).toBe(true)
    expect(service.start('a', options).ok).toBe(false)
    child.emit('close', 0, null)
  })
})
