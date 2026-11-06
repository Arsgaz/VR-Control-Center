import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '@shared/config/default-config'
import type { AppConfig } from '@shared/contracts/config.contracts'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import type { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'
import {
  connectAdbDevice,
  disconnectAdbDevice,
  getDeviceBattery,
  getForegroundApplication,
  listAdbDevices
} from '@main/infrastructure/adb/adb.service'
import { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import { synchronizeDeviceTime } from '@main/infrastructure/adb/device-time.service'

vi.mock('@main/infrastructure/adb/adb.service', () => ({
  connectAdbDevice: vi.fn(),
  disconnectAdbDevice: vi.fn(),
  listAdbDevices: vi.fn(),
  getDeviceBattery: vi.fn().mockResolvedValue({}),
  getForegroundApplication: vi.fn().mockResolvedValue({})
}))
vi.mock('@main/infrastructure/adb/device-time.service', () => ({ synchronizeDeviceTime: vi.fn() }))

let manager: HeadsetRuntimeManager
let config: AppConfig
let changed: (config: AppConfig) => void
const emit = vi.fn()
const stop = vi.fn()
const stopAndWait = vi.fn()
const start = vi.fn()
const success = { ok: true, message: 'ok', stdout: '', stderr: '' }
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const connected = {
  devices: [{ serial: '10.0.0.1:5555', state: 'device', rawState: 'device' }],
  stdout: '',
  stderr: ''
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  vi.resetAllMocks()
  vi.mocked(synchronizeDeviceTime).mockResolvedValue({
    ok: true,
    address: '10.0.0.1:5555',
    computerTimeMs: Date.now(),
    deviceTimeMs: Date.now(),
    differenceMs: 0
  })
  vi.mocked(getDeviceBattery).mockResolvedValue({} as never)
  vi.mocked(getForegroundApplication).mockResolvedValue({} as never)
  config = createDefaultConfig()
  config.settings.autoReconnect = false
  config.settings.runtimePollingIntervalSeconds = 5
  config.devices = [{ id: 'a', name: 'A', address: '10.0.0.1:5555', streamProfileId: null }]
  vi.mocked(listAdbDevices).mockResolvedValue({ devices: [], stdout: '', stderr: '' })
  vi.mocked(connectAdbDevice).mockResolvedValue({
    ok: false,
    message: 'failed',
    stdout: '',
    stderr: ''
  })
  vi.mocked(disconnectAdbDevice).mockResolvedValue(success)
  stopAndWait.mockResolvedValue({ ok: true, status: { state: 'stopped', pid: null, message: '' } })
  start.mockReturnValue({
    ok: true,
    status: { state: 'starting', pid: 42, message: '' },
    message: ''
  })
  const configuration = {
    load: async () => ({ config }),
    onDidChange: (listener: typeof changed) => {
      changed = listener
      return vi.fn()
    }
  } as unknown as ConfigurationService
  const scrcpy = {
    stop,
    stopAndWait,
    start,
    setBinaryResolver: vi.fn(),
    getStatus: () => ({ state: 'stopped', message: '', pid: null })
  } as unknown as ScrcpyService
  manager = new HeadsetRuntimeManager(emit, scrcpy, configuration)
  await manager.initialize()
  await vi.advanceTimersByTimeAsync(0)
})

afterEach(() => {
  manager.shutdown()
  vi.useRealTimers()
})

describe('HeadsetRuntimeManager', () => {
  it('serializes time synchronization after connection and uses only the selected address', async () => {
    const connecting = deferred<typeof success>()
    vi.mocked(connectAdbDevice).mockReturnValueOnce(connecting.promise)
    const connection = manager.connect('a')
    const time = manager.syncTime('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(synchronizeDeviceTime).not.toHaveBeenCalled()
    connecting.resolve(success)
    await connection
    expect((await time).ok).toBe(true)
    expect(synchronizeDeviceTime).toHaveBeenCalledWith(
      '10.0.0.1:5555',
      expect.anything(),
      expect.any(Function)
    )
  })

  it('cancels a queued time update if disconnect was requested before it starts', async () => {
    const connecting = deferred<typeof success>()
    vi.mocked(connectAdbDevice).mockReturnValueOnce(connecting.promise)
    const connection = manager.connect('a')
    await vi.advanceTimersByTimeAsync(0)
    const time = manager.syncTime('a')
    const disconnected = manager.disconnect('a')
    connecting.resolve(success)
    await connection
    expect(await time).toEqual({ ok: false, code: 'SUPERSEDED' })
    await disconnected
    expect(synchronizeDeviceTime).not.toHaveBeenCalled()
  })

  it('waits for the active time operation before disconnecting the same headset', async () => {
    const updated = deferred<Awaited<ReturnType<typeof synchronizeDeviceTime>>>()
    vi.mocked(synchronizeDeviceTime).mockReturnValueOnce(updated.promise)
    const time = manager.syncTime('a')
    await vi.advanceTimersByTimeAsync(0)
    const disconnected = manager.disconnect('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(disconnectAdbDevice).not.toHaveBeenCalled()
    expect(vi.mocked(synchronizeDeviceTime).mock.calls[0][2]!()).toBe(false)
    updated.resolve({ ok: false, code: 'SUPERSEDED' })
    expect(await time).toEqual({ ok: false, code: 'SUPERSEDED' })
    await disconnected
    expect(disconnectAdbDevice).toHaveBeenCalledOnce()
  })

  it('does not block streaming B while time is being updated on A', async () => {
    config.devices.push({ id: 'b', name: 'B', address: '10.0.0.2:5555', streamProfileId: null })
    changed(config)
    vi.mocked(listAdbDevices).mockResolvedValue({
      devices: [{ serial: '10.0.0.2:5555', state: 'device', rawState: 'device' }],
      stdout: '',
      stderr: ''
    })
    const updated = deferred<Awaited<ReturnType<typeof synchronizeDeviceTime>>>()
    vi.mocked(synchronizeDeviceTime).mockReturnValueOnce(updated.promise)
    const time = manager.syncTime('a')
    expect((await manager.startStream('b')).ok).toBe(true)
    updated.resolve({
      ok: true,
      address: '10.0.0.1:5555',
      computerTimeMs: Date.now(),
      deviceTimeMs: Date.now(),
      differenceMs: 0
    })
    expect((await time).ok).toBe(true)
  })

  it('rejects a pending time result if the headset address changes', async () => {
    const updated = deferred<Awaited<ReturnType<typeof synchronizeDeviceTime>>>()
    vi.mocked(synchronizeDeviceTime).mockReturnValueOnce(updated.promise)
    const time = manager.syncTime('a')
    await vi.advanceTimersByTimeAsync(0)
    config.devices = [{ ...config.devices[0], address: '10.0.0.9:5555' }]
    changed(config)
    expect(vi.mocked(synchronizeDeviceTime).mock.calls[0][2]!()).toBe(false)
    updated.resolve({
      ok: true,
      address: '10.0.0.1:5555',
      computerTimeMs: Date.now(),
      deviceTimeMs: Date.now(),
      differenceMs: 0
    })
    expect(await time).toEqual({ ok: false, code: 'SUPERSEDED' })
  })

  it('does not update the time of a deleted headset', async () => {
    config.devices = []
    changed(config)
    expect(await manager.syncTime('a')).toEqual({ ok: false, code: 'DEVICE_NOT_FOUND' })
    expect(synchronizeDeviceTime).not.toHaveBeenCalled()
  })
  it('uses 36 ADB operations over two background minutes with eight connected headsets', async () => {
    config.settings.runtimePollingIntervalSeconds = 10
    config.devices = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: String(i),
      address: `10.0.0.${i + 1}:5555`,
      streamProfileId: null
    }))
    changed(config)
    vi.mocked(listAdbDevices).mockResolvedValue({
      devices: config.devices.map((device) => ({
        serial: device.address,
        state: 'device',
        rawState: 'device'
      })),
      stdout: '',
      stderr: ''
    })
    manager.setBackgroundMode(true)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(listAdbDevices).toHaveBeenCalledTimes(12)
    expect(getDeviceBattery).toHaveBeenCalledTimes(8)
    expect(getForegroundApplication).toHaveBeenCalledTimes(16)
  })
  it('detects loss of connection while an older telemetry command is still pending', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue(connected as never)
    const battery = deferred<Awaited<ReturnType<typeof getDeviceBattery>>>()
    vi.mocked(getDeviceBattery).mockReturnValueOnce(battery.promise)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await manager.getRuntime('a')).connectionState).toBe('connected')
    vi.mocked(listAdbDevices).mockResolvedValue({ devices: [], stdout: '', stderr: '' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(listAdbDevices).toHaveBeenCalledTimes(2)
    expect((await manager.getRuntime('a')).connectionState).toBe('disconnected')
    battery.resolve({ batteryLevel: 80 } as never)
    await vi.advanceTimersByTimeAsync(0)
    expect((await manager.getRuntime('a')).connectionState).toBe('disconnected')
    expect((await manager.getRuntime('a')).batteryLevel).toBeNull()
  })
  it('keeps checking connections in the background but polls foreground and battery less often', async () => {
    config.settings.runtimePollingIntervalSeconds = 10
    vi.mocked(listAdbDevices).mockResolvedValue(connected as never)
    manager.setBackgroundMode(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(listAdbDevices).toHaveBeenCalledTimes(6)
    expect(getDeviceBattery).toHaveBeenCalledTimes(1)
    expect(getForegroundApplication).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(getForegroundApplication).toHaveBeenCalledTimes(2)
    expect(getDeviceBattery).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(getDeviceBattery).toHaveBeenCalledTimes(2)
    expect(getForegroundApplication).toHaveBeenCalledTimes(3)
  })

  it('retains battery readings between visible polling rounds instead of clearing them', async () => {
    config.settings.runtimePollingIntervalSeconds = 10
    vi.mocked(listAdbDevices).mockResolvedValue(connected as never)
    vi.mocked(getDeviceBattery).mockResolvedValue({ batteryLevel: 70 } as never)
    await vi.advanceTimersByTimeAsync(21_000)
    expect(getDeviceBattery).toHaveBeenCalledTimes(1)
    expect(getForegroundApplication).toHaveBeenCalledTimes(3)
    expect((await manager.getRuntime('a')).batteryLevel).toBe(70)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getDeviceBattery).toHaveBeenCalledTimes(2)
  })

  it('refreshes telemetry immediately on restore and still permits explicit background refresh', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue(connected as never)
    manager.setBackgroundMode(true)
    await vi.advanceTimersByTimeAsync(1000)
    await manager.refreshRuntime('a')
    expect(getDeviceBattery).toHaveBeenCalledTimes(2)
    manager.setBackgroundMode(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(getDeviceBattery).toHaveBeenCalledTimes(3)
    expect(getForegroundApplication).toHaveBeenCalledTimes(3)
    manager.setBackgroundMode(false) // An already-visible window causes no extra work.
    await vi.advanceTimersByTimeAsync(0)
    expect(getDeviceBattery).toHaveBeenCalledTimes(3)
  })

  it('does not lose a restore request while an older polling round is pending', async () => {
    manager.setBackgroundMode(true)
    vi.mocked(listAdbDevices).mockResolvedValue(connected as never)
    const battery = deferred<Awaited<ReturnType<typeof getDeviceBattery>>>()
    vi.mocked(getDeviceBattery).mockReturnValueOnce(battery.promise)
    await vi.advanceTimersByTimeAsync(1000)
    manager.setBackgroundMode(false)
    battery.resolve({} as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(getDeviceBattery).toHaveBeenCalledTimes(2)
    expect(getForegroundApplication).toHaveBeenCalledTimes(2)
  })

  it('limits telemetry to two commands without blocking connection or streaming of another headset', async () => {
    config.devices = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: String(i),
      address: `10.0.0.${i + 1}:5555`,
      streamProfileId: null
    }))
    changed(config)
    vi.mocked(listAdbDevices).mockResolvedValue({
      devices: config.devices.map((device) => ({
        serial: device.address,
        state: 'device',
        rawState: 'device'
      })),
      stdout: '',
      stderr: ''
    } as never)
    const gate = deferred<void>()
    let active = 0
    let maximum = 0
    const telemetry = async () => {
      active++
      maximum = Math.max(maximum, active)
      await gate.promise
      active--
      return {
        batteryLevel: 70,
        batteryStatus: null,
        isCharging: false,
        batteryTemperatureCelsius: null,
        batteryVoltageMillivolts: null,
        foregroundPackage: 'com.test',
        foregroundActivity: null,
        foregroundApplicationName: 'Test'
      }
    }
    vi.mocked(getDeviceBattery).mockImplementation(telemetry)
    vi.mocked(getForegroundApplication).mockImplementation(telemetry)
    await vi.advanceTimersByTimeAsync(1000)
    expect(active).toBe(2)
    // Discovery is published even while all telemetry slots are occupied by headset 0.
    expect((await manager.getRuntime('1')).connectionState).toBe('connected')
    vi.mocked(connectAdbDevice).mockResolvedValue(success)
    expect((await manager.connect('1')).ok).toBe(true)
    expect((await manager.startStream('1')).ok).toBe(true)
    expect(active).toBe(2)
    gate.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(maximum).toBe(2)
    expect(active).toBe(0)
    // Old queued reads of headset 1 were invalidated by its new connection intent.
    expect(
      vi.mocked(getDeviceBattery).mock.calls.some(([address]) => address === '10.0.0.2:5555')
    ).toBe(false)
  })
  it('waits for stream termination before restarting the same headset', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue(connected as never)
    const stopped = deferred<Awaited<ReturnType<ScrcpyService['stopAndWait']>>>()
    stopAndWait.mockReturnValueOnce(stopped.promise)
    const stopping = manager.stopStream('a')
    const starting = manager.startStream('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(start).not.toHaveBeenCalled()
    stopped.resolve({ ok: true, status: { state: 'exited' } } as never)
    await stopping
    expect((await starting).ok).toBe(true)
    expect(start).toHaveBeenCalledWith('a', expect.objectContaining({ address: '10.0.0.1:5555' }))
  })

  it('can start B while waiting for stream A to stop', async () => {
    config.devices.push({ id: 'b', name: 'B', address: '10.0.0.2:5555', streamProfileId: null })
    changed(config)
    vi.mocked(listAdbDevices).mockResolvedValue({
      ...connected,
      devices: [{ serial: '10.0.0.2:5555', state: 'device', rawState: 'device' }]
    } as never)
    const stopped = deferred<Awaited<ReturnType<ScrcpyService['stopAndWait']>>>()
    stopAndWait.mockReturnValueOnce(stopped.promise)
    const stopping = manager.stopStream('a')
    expect((await manager.startStream('b')).ok).toBe(true)
    expect(start).toHaveBeenCalledWith('b', expect.objectContaining({ address: '10.0.0.2:5555' }))
    stopped.resolve({ ok: true, status: { state: 'exited' } } as never)
    await stopping
  })

  it('rejects stream startup if the selected ADB transport is absent', async () => {
    await expect(manager.startStream('a')).rejects.toThrow('Device is not connected')
    expect(start).not.toHaveBeenCalled()
  })

  it('shares one ADB device list across eight headsets in a polling round', async () => {
    config.devices = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: String(i),
      address: `10.0.0.${i + 1}:5555`,
      streamProfileId: null
    }))
    changed(config)
    vi.mocked(listAdbDevices).mockResolvedValue({
      devices: config.devices.map((device) => ({
        serial: device.address,
        state: 'device',
        rawState: 'device'
      })),
      stdout: '',
      stderr: ''
    } as never)
    await vi.advanceTimersByTimeAsync(1000)
    expect(listAdbDevices).toHaveBeenCalledTimes(1)
    expect(getDeviceBattery).toHaveBeenCalledTimes(8)
  })

  it('discards only the disconnected device from an in-flight shared polling snapshot', async () => {
    config.devices.push({ id: 'b', name: 'B', address: '10.0.0.2:5555', streamProfileId: null })
    changed(config)
    const listing = deferred<Awaited<ReturnType<typeof listAdbDevices>>>()
    vi.mocked(listAdbDevices).mockReturnValueOnce(listing.promise)
    await vi.advanceTimersByTimeAsync(1000)
    await manager.disconnect('a')
    listing.resolve({
      devices: config.devices.map((device) => ({
        serial: device.address,
        state: 'device',
        rawState: 'device'
      })),
      stdout: '',
      stderr: ''
    } as never)
    await vi.advanceTimersByTimeAsync(0)
    expect((await manager.getRuntime('a')).connectionState).toBe('disconnected')
    expect((await manager.getRuntime('b')).connectionState).toBe('connected')
    expect(listAdbDevices).toHaveBeenCalledTimes(1)
  })

  it('does not start a stream whose address changes during the connection check', async () => {
    const listing = deferred<Awaited<ReturnType<typeof listAdbDevices>>>()
    vi.mocked(listAdbDevices).mockReturnValueOnce(listing.promise)
    const failed = expect(manager.startStream('a')).rejects.toThrow('superseded')
    await vi.advanceTimersByTimeAsync(0)
    config.devices = [{ ...config.devices[0], address: '10.0.0.9:5555' }]
    changed(config)
    listing.resolve(connected as never)
    await failed
    expect(start).not.toHaveBeenCalled()
  })

  it('limits simultaneous automatic connection commands to three', async () => {
    config.devices = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: String(i),
      address: `10.0.0.${i + 1}:5555`,
      streamProfileId: null
    }))
    changed(config)
    const connecting = Array.from({ length: 3 }, () => deferred<typeof success>())
    for (const pending of connecting)
      vi.mocked(connectAdbDevice).mockReturnValueOnce(pending.promise)
    config.settings.autoReconnect = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(connectAdbDevice).toHaveBeenCalledTimes(3)
    for (const pending of connecting) pending.resolve(success)
    await vi.advanceTimersByTimeAsync(0)
    expect(connectAdbDevice).toHaveBeenCalledTimes(8)
  })
  it('does not let a pending telemetry response overwrite a manual disconnect', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue(connected as never)
    const battery = deferred<Awaited<ReturnType<typeof getDeviceBattery>>>()
    vi.mocked(getDeviceBattery).mockReturnValueOnce(battery.promise)
    const refreshing = manager.refreshRuntime('a')
    await vi.advanceTimersByTimeAsync(0)
    await manager.disconnect('a')
    battery.resolve({} as never)
    expect((await refreshing).ok).toBe(false)
    expect((await manager.getRuntime('a')).connectionState).toBe('disconnected')
    expect((await manager.getRuntime('a')).isRuntimeRefreshInProgress).toBe(false)
  })

  it('waits for an automatic connect before executing manual disconnect', async () => {
    const connecting = deferred<typeof success>()
    vi.mocked(connectAdbDevice).mockReturnValueOnce(connecting.promise)
    config.settings.autoReconnect = true
    await vi.advanceTimersByTimeAsync(5000)
    const disconnecting = manager.disconnect('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(disconnectAdbDevice).not.toHaveBeenCalled()
    connecting.resolve(success)
    await disconnecting
    expect(disconnectAdbDevice).toHaveBeenCalledWith('10.0.0.1:5555', expect.anything())
    const runtime = await manager.getRuntime('a')
    expect(runtime.connectionState).toBe('disconnected')
    expect(runtime.suspendedAutoReconnect).toBe(true)
    await vi.advanceTimersByTimeAsync(65000)
    expect(connectAdbDevice).toHaveBeenCalledTimes(1)
  })

  it('rejects the stale result of a manual connect followed by disconnect', async () => {
    const connecting = deferred<typeof success>()
    vi.mocked(connectAdbDevice).mockReturnValueOnce(connecting.promise)
    const first = manager.connect('a')
    await vi.advanceTimersByTimeAsync(0)
    const second = manager.disconnect('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(disconnectAdbDevice).not.toHaveBeenCalled()
    connecting.resolve(success)
    expect((await first).ok).toBe(false)
    await second
    expect((await manager.getRuntime('a')).connectionState).toBe('disconnected')
  })

  it('connects another headset while the first automatic connection is pending', async () => {
    config.devices.push({ id: 'b', name: 'B', address: '10.0.0.2:5555', streamProfileId: null })
    changed(config)
    const connecting = deferred<typeof success>()
    vi.mocked(connectAdbDevice)
      .mockReturnValueOnce(connecting.promise)
      .mockResolvedValueOnce(success)
    config.settings.autoReconnect = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(connectAdbDevice).toHaveBeenCalledTimes(2)
    expect(vi.mocked(connectAdbDevice).mock.calls[1][0]).toBe('10.0.0.2:5555')
    connecting.resolve(success)
    await vi.advanceTimersByTimeAsync(0)
  })

  it('continues reconnecting other devices after one command rejects', async () => {
    config.devices.push({ id: 'b', name: 'B', address: '10.0.0.2:5555', streamProfileId: null })
    changed(config)
    vi.mocked(connectAdbDevice)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(success)
    config.settings.autoReconnect = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(connectAdbDevice).toHaveBeenCalledTimes(2)
    expect((await manager.getRuntime('a')).connectionState).toBe('error')
  })

  it('discards an old refresh even after the same device id and address are recreated', async () => {
    const listing = deferred<Awaited<ReturnType<typeof listAdbDevices>>>()
    vi.mocked(listAdbDevices).mockReturnValueOnce(listing.promise)
    const refreshing = manager.refreshRuntime('a')
    await vi.advanceTimersByTimeAsync(0)
    const original = config.devices
    config.devices = []
    changed(config)
    config.devices = original
    changed(config)
    emit.mockClear()
    listing.resolve(connected as never)
    expect((await refreshing).ok).toBe(false)
    expect(emit).not.toHaveBeenCalled()
    expect((await manager.getRuntime('a')).connectionState).toBe('unknown')
  })

  it('does not convert process output into redundant runtime updates', async () => {
    await manager.handleScrcpyEvent({ deviceId: 'a', type: 'stdout' } as never)
    expect(emit).not.toHaveBeenCalled()
  })
  it('honors the selected polling interval and applies changes without restarting', async () => {
    await vi.advanceTimersByTimeAsync(1000)
    expect(listAdbDevices).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4000)
    expect(listAdbDevices).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(listAdbDevices).toHaveBeenCalledTimes(2)
    config.settings.runtimePollingIntervalSeconds = 10
    await vi.advanceTimersByTimeAsync(9000)
    expect(listAdbDevices).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(listAdbDevices).toHaveBeenCalledTimes(3)
  })

  it('retries disconnected devices even while runtime polling continues', async () => {
    config.settings.autoReconnect = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(connectAdbDevice).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(19000)
    expect(connectAdbDevice).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(connectAdbDevice).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'connection', deviceId: 'a' })
    )
  })

  it('does not overlap refreshes requested simultaneously', async () => {
    let finish!: (value: { devices: []; stdout: string; stderr: string }) => void
    vi.mocked(listAdbDevices).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const first = manager.refreshRuntime('a')
    const second = manager.refreshRuntime('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(listAdbDevices).toHaveBeenCalledTimes(1)
    finish({ devices: [], stdout: '', stderr: '' })
    await Promise.all([first, second])
  })

  it('stops removed devices and ignores their late process events', async () => {
    config.devices = []
    changed(config)
    expect(stop).toHaveBeenCalledWith('a')
    emit.mockClear()
    await manager.handleScrcpyEvent({
      deviceId: 'a',
      type: 'exit',
      status: { address: '10.0.0.1:5555' }
    } as never)
    expect(emit).not.toHaveBeenCalled()
  })

  it('does not publish a pending refresh after a reset', async () => {
    let finish!: (value: { devices: []; stdout: string; stderr: string }) => void
    vi.mocked(listAdbDevices).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const refresh = manager.refreshRuntime('a')
    await vi.advanceTimersByTimeAsync(0)
    config.devices = []
    changed(config)
    emit.mockClear()
    finish({ devices: [], stdout: '', stderr: '' })
    await refresh
    expect(emit).not.toHaveBeenCalled()
  })
})
