import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from '@main/infrastructure/process/process-runner'
import { listAdbDevices } from '@main/infrastructure/adb/adb.service'
import {
  didSetDeviceTime,
  synchronizeDeviceTime
} from '@main/infrastructure/adb/device-time.service'

vi.mock('@main/infrastructure/process/process-runner', () => ({ runCommand: vi.fn() }))
vi.mock('@main/infrastructure/adb/adb.service', async (original) => ({
  ...(await original<typeof import('@main/infrastructure/adb/adb.service')>()),
  listAdbDevices: vi.fn()
}))
const address = '10.0.0.2:5555'
const resolver = { adb: () => '/custom/adb', scrcpy: () => 'scrcpy' }
const reply = (stdout: string, exitCode = 0, stderr = '') => ({
  stdout,
  stderr,
  exitCode,
  signal: null
})
const success = "Result: Parcel(00000000 00000001 '........')"
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-06T12:34:56Z'))
  vi.mocked(listAdbDevices).mockResolvedValue({
    devices: [
      { serial: address, state: 'device', rawState: 'device' },
      { serial: '10.0.0.3:5555', state: 'device', rawState: 'device' }
    ],
    stdout: '',
    stderr: ''
  })
  vi.mocked(runCommand)
    .mockResolvedValueOnce(reply(success))
    .mockImplementation(async () => reply(String(Math.floor(Date.now() / 1000))))
})
afterEach(() => vi.useRealTimers())

describe('Headset time synchronization', () => {
  it('does not trust a successful Parcel if the command exit code is nonzero', async () => {
    vi.mocked(runCommand).mockReset().mockResolvedValue(reply(success, 1))
    expect(await synchronizeDeviceTime(address, resolver)).toEqual({
      ok: false,
      code: 'SET_FAILED'
    })
    expect(runCommand).toHaveBeenCalledTimes(1)
  })

  it('does not trust a failed verification command even if its output contains the expected timestamp', async () => {
    vi.mocked(runCommand)
      .mockReset()
      .mockResolvedValueOnce(reply(success))
      .mockResolvedValueOnce(reply(String(Math.floor(Date.now() / 1000)), 1))
    expect(await synchronizeDeviceTime(address, resolver)).toEqual({
      ok: false,
      code: 'VERIFY_FAILED'
    })
  })
  it('targets only the selected serial and sends milliseconds, then reads the device clock', async () => {
    const now = Date.now()
    expect(await synchronizeDeviceTime(address, resolver)).toEqual({
      ok: true,
      address,
      computerTimeMs: now,
      deviceTimeMs: now,
      differenceMs: 0
    })
    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      '/custom/adb',
      ['-s', address, 'shell', 'service', 'call', 'alarm', '2', 'i64', String(now)],
      { timeoutMs: 10000 }
    )
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      '/custom/adb',
      ['-s', address, 'shell', 'date', '+%s'],
      { timeoutMs: 10000 }
    )
  })

  it('samples fresh PC time after a slow transport discovery rather than before it', async () => {
    vi.mocked(listAdbDevices).mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 60_000)
      return {
        devices: [{ serial: address, state: 'device', rawState: 'device' }],
        stdout: '',
        stderr: ''
      }
    })
    await synchronizeDeviceTime(address, resolver)
    expect(vi.mocked(runCommand).mock.calls[0][1].at(-1)).toBe(String(Date.now()))
  })

  it('does not target another connected device if the selected headset is absent', async () => {
    vi.mocked(listAdbDevices).mockResolvedValueOnce({
      devices: [{ serial: 'other', state: 'device', rawState: 'device' }],
      stdout: '',
      stderr: ''
    })
    expect(await synchronizeDeviceTime(address, resolver)).toEqual({
      ok: false,
      code: 'NOT_CONNECTED'
    })
    expect(runCommand).not.toHaveBeenCalled()
  })

  it.each(['offline', 'unauthorized'] as const)(
    'does not write the clock of a %s transport',
    async (state) => {
      vi.mocked(listAdbDevices).mockResolvedValueOnce({
        devices: [{ serial: address, state, rawState: state }],
        stdout: '',
        stderr: ''
      })
      expect(await synchronizeDeviceTime(address, resolver)).toEqual({
        ok: false,
        code: 'NOT_CONNECTED'
      })
      expect(runCommand).not.toHaveBeenCalled()
    }
  )

  it('reports permission denial even if service exits with code zero', async () => {
    vi.mocked(runCommand)
      .mockReset()
      .mockResolvedValue(
        reply('Result: Parcel(Error: java.lang.SecurityException: requires SET_TIME)')
      )
    expect(await synchronizeDeviceTime(address, resolver)).toEqual({
      ok: false,
      code: 'PERMISSION_DENIED'
    })
    expect(runCommand).toHaveBeenCalledTimes(1)
  })

  it.each(["Result: Parcel(00000000 00000000 '........')", 'Result: Parcel(00000000)', ''])(
    'does not claim success for an unconfirmed Binder result: %s',
    async (output) => {
      vi.mocked(runCommand).mockReset().mockResolvedValue(reply(output))
      expect(await synchronizeDeviceTime(address, resolver)).toEqual({
        ok: false,
        code: 'SET_FAILED'
      })
    }
  )

  it.each(['123', 'invalid date', '1700000000'])(
    'rejects an incorrect or unreadable device clock: %s',
    async (output) => {
      vi.mocked(runCommand)
        .mockReset()
        .mockResolvedValueOnce(reply(success))
        .mockResolvedValueOnce(reply(output))
      expect(await synchronizeDeviceTime(address, resolver)).toEqual({
        ok: false,
        code: 'VERIFY_FAILED'
      })
    }
  )

  it('reports command timeouts without a successful result', async () => {
    vi.mocked(runCommand).mockReset().mockRejectedValue(new Error('timeout'))
    expect(await synchronizeDeviceTime(address, resolver)).toEqual({
      ok: false,
      code: 'COMMAND_FAILED'
    })
  })

  it('does not write time after the device was changed during discovery', async () => {
    let current = true
    vi.mocked(listAdbDevices).mockImplementationOnce(async () => {
      current = false
      return { devices: [], stdout: '', stderr: '' }
    })
    expect(await synchronizeDeviceTime(address, resolver, () => current)).toEqual({
      ok: false,
      code: 'SUPERSEDED'
    })
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('does not perform follow-up commands after the operation is superseded', async () => {
    let current = true
    vi.mocked(runCommand)
      .mockReset()
      .mockImplementationOnce(async () => {
        current = false
        return reply(success)
      })
    expect(await synchronizeDeviceTime(address, resolver, () => current)).toEqual({
      ok: false,
      code: 'SUPERSEDED'
    })
    expect(runCommand).toHaveBeenCalledTimes(1)
  })

  it('parses compact and multiline Parcel results without accepting exception data', () => {
    expect(didSetDeviceTime(success)).toBe(true)
    expect(didSetDeviceTime("Result: Parcel(\n  0x00000000: 00000000 00000001 '........'\n)")).toBe(
      true
    )
    expect(didSetDeviceTime("Result: Parcel(ffffffff 00000001 '........')")).toBe(false)
  })
})
