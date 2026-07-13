import type { DeviceConfig } from '../../shared/contracts/config.contracts'
import type {
  AdbDevice,
  DeviceRuntimeEvent,
  DeviceRuntimeResult,
  DeviceRuntimeState,
  ScrcpyProcessEvent,
  ScrcpyStartResult,
  ScrcpyStopResult
} from '../../shared/contracts/headset.contracts'
import {
  connectAdbDevice,
  disconnectAdbDevice,
  getDeviceBattery,
  getForegroundApplication,
  listAdbDevices
} from '../tools/adb.service'
import { ScrcpyService } from '../tools/scrcpy.service'
import { configurationService } from '../config/configuration.service'
import { logger } from '../logger/logger'
import { createBinaryResolverFromSettings, type BinaryResolver } from '../tools/binary-resolver'
import {
  allowAutoReconnectAfterManualConnect,
  canStartRuntimeRefresh,
  suspendAutoReconnectAfterManualDisconnect
} from './headset-runtime.policy'

const RUNTIME_POLL_MS = 20_000
const AUTO_RECONNECT_DELAYS_MS = [10_000, 20_000, 40_000, 60_000]

const createRuntime = (device: DeviceConfig): DeviceRuntimeState => ({
  deviceId: device.id,
  deviceAddress: device.address,
  connectionState: 'unknown',
  connectionMessage: 'Runtime has not been refreshed yet.',
  streamState: 'stopped',
  streamSessionId: null,
  streamMessage: 'scrcpy is not running',
  batteryLevel: null,
  batteryStatus: null,
  isCharging: null,
  batteryTemperatureCelsius: null,
  batteryVoltageMillivolts: null,
  foregroundPackage: null,
  foregroundActivity: null,
  foregroundApplicationName: null,
  lastRuntimeRefreshAt: null,
  lastSuccessfulRuntimeRefreshAt: null,
  lastError: null,
  isRuntimeRefreshInProgress: false,
  suspendedAutoReconnect: false
})

export class HeadsetRuntimeManager {
  private readonly runtimeByDeviceId = new Map<string, DeviceRuntimeState>()
  private readonly refreshInProgress = new Set<string>()
  private readonly reconnectAttempts = new Map<string, number>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private pollingTimer: NodeJS.Timeout | null = null

  public constructor(
    private readonly emitRuntimeEvent: (event: DeviceRuntimeEvent) => void,
    private readonly scrcpyService: ScrcpyService
  ) {}

  public async initialize(): Promise<void> {
    await this.syncConfiguredDevices()
    this.startTimers()
    void this.autoReconnectKnownDevices()
  }

  public shutdown(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pollingTimer) clearTimeout(this.pollingTimer)
    this.reconnectTimer = null
    this.pollingTimer = null
  }

  public async getRuntime(deviceId: string): Promise<DeviceRuntimeState> {
    const device = await this.getDevice(deviceId)
    return this.ensureRuntime(device)
  }

  public async connect(deviceId: string): Promise<DeviceRuntimeResult> {
    const device = await this.getDevice(deviceId)
    const resolver = await this.getBinaryResolver()
    this.updateRuntime(device, allowAutoReconnectAfterManualConnect(this.ensureRuntime(device)))
    const result = await connectAdbDevice(device.address, resolver)
    const runtime = this.updateRuntime(device, {
      connectionState: result.ok ? 'connected' : 'error',
      connectionMessage: result.message,
      lastError: result.ok ? null : 'ADB connection failed.',
      lastRuntimeRefreshAt: new Date().toISOString(),
      lastSuccessfulRuntimeRefreshAt: result.ok ? new Date().toISOString() : this.ensureRuntime(device).lastSuccessfulRuntimeRefreshAt
    })
    this.reconnectAttempts.set(deviceId, 0)
    this.emit('connection', runtime, result.message)
    if (result.ok) {
      void this.refreshRuntime(deviceId)
    }
    return { ok: result.ok, runtime, message: result.message }
  }

  public async disconnect(deviceId: string): Promise<DeviceRuntimeResult> {
    const device = await this.getDevice(deviceId)
    const resolver = await this.getBinaryResolver()
    this.updateRuntime(device, suspendAutoReconnectAfterManualDisconnect(this.ensureRuntime(device)))
    this.scrcpyService.stop(deviceId)
    const result = await disconnectAdbDevice(device.address, resolver)
    const runtime = this.updateRuntime(device, {
      connectionState: result.ok ? 'disconnected' : 'error',
      connectionMessage: result.message,
      streamState: this.scrcpyService.getStatus(deviceId).state,
      streamSessionId: null,
      streamMessage: this.scrcpyService.getStatus(deviceId).message,
      lastError: result.ok ? null : 'ADB disconnect failed.',
      lastRuntimeRefreshAt: new Date().toISOString()
    })
    this.emit('connection', runtime, result.message)
    return { ok: result.ok, runtime, message: result.message }
  }

  public async refreshRuntime(deviceId: string): Promise<DeviceRuntimeResult> {
    if (!canStartRuntimeRefresh({ activeDeviceIds: this.refreshInProgress }, deviceId)) {
      const runtime = await this.getRuntime(deviceId)
      return { ok: true, runtime, message: 'Runtime refresh is already in progress' }
    }

    const device = await this.getDevice(deviceId)
    this.refreshInProgress.add(deviceId)
    this.updateRuntime(device, { isRuntimeRefreshInProgress: true })

    try {
      const now = new Date().toISOString()
      const resolver = await this.getBinaryResolver()
      const devices = await listAdbDevices(resolver)
      const adbDevice = devices.devices.find((item) => item.serial === device.address)
      const connection = this.getConnectionState(adbDevice)

      if (connection.connectionState !== 'connected') {
        const runtime = this.updateRuntime(device, {
          ...connection,
          lastRuntimeRefreshAt: now,
          isRuntimeRefreshInProgress: false
        })
        this.emit('runtime', runtime, connection.connectionMessage)
        return { ok: false, runtime, message: connection.connectionMessage }
      }

      const [batteryResult, foregroundResult] = await Promise.allSettled([
        getDeviceBattery(device.address, resolver),
        getForegroundApplication(device.address, resolver)
      ])

      const battery =
        batteryResult.status === 'fulfilled'
          ? batteryResult.value
          : {
              batteryLevel: null,
              batteryStatus: null,
              isCharging: null,
              batteryTemperatureCelsius: null,
              batteryVoltageMillivolts: null
            }
      const foreground =
        foregroundResult.status === 'fulfilled'
          ? foregroundResult.value
          : {
              foregroundPackage: null,
              foregroundActivity: null,
              foregroundApplicationName: null
            }

      if (batteryResult.status === 'rejected') {
        logger.warn('Battery runtime refresh failed', { deviceId, address: device.address })
      }
      if (foregroundResult.status === 'rejected') {
        logger.warn('Foreground runtime refresh failed', { deviceId, address: device.address })
      }

      const runtime = this.updateRuntime(device, {
        ...connection,
        ...battery,
        ...foreground,
        streamState: this.scrcpyService.getStatus(deviceId).state,
        streamSessionId: this.scrcpyService.getStatus(deviceId).pid
          ? String(this.scrcpyService.getStatus(deviceId).pid)
          : null,
        streamMessage: this.scrcpyService.getStatus(deviceId).message,
        lastRuntimeRefreshAt: now,
        lastSuccessfulRuntimeRefreshAt: now,
        lastError:
          batteryResult.status === 'rejected' && foregroundResult.status === 'rejected'
            ? 'Runtime refresh failed.'
            : null,
        isRuntimeRefreshInProgress: false
      })
      this.emit('runtime', runtime, 'Runtime refreshed')
      return { ok: true, runtime, message: 'Runtime refreshed' }
    } catch (error) {
      logger.errorWithCause('Runtime refresh failed', error, { deviceId, address: device.address })
      const runtime = this.updateRuntime(device, {
        connectionState: 'error',
        connectionMessage: 'Runtime refresh failed.',
        lastError: 'Runtime refresh failed.',
        lastRuntimeRefreshAt: new Date().toISOString(),
        isRuntimeRefreshInProgress: false
      })
      this.emit('runtime', runtime, 'Runtime refresh failed')
      return { ok: false, runtime, message: 'Runtime refresh failed' }
    } finally {
      this.refreshInProgress.delete(deviceId)
    }
  }

  public async startStream(deviceId: string): Promise<ScrcpyStartResult> {
    const state = await configurationService.load()
    const device = state.config.devices.find((item) => item.id === deviceId)
    if (!device) throw new Error(`Unknown device id: ${deviceId}`)
    const profile =
      state.config.streamProfiles.find((item) => item.id === device.streamProfileId) ??
      state.config.streamProfiles[0] ??
      null
    this.scrcpyService.setBinaryResolver(createBinaryResolverFromSettings(state.config.settings))

    const result = this.scrcpyService.start(deviceId, {
      address: device.address,
      crop: profile?.crop ?? '',
      maxSize: profile?.maxSize ?? null,
      maxFps: profile?.maxFps ?? null,
      videoBitRate: profile?.videoBitRate ?? '',
      videoCodec: profile?.videoCodec ?? 'h264',
      noAudio: profile?.noAudio ?? true
    })
    const runtime = this.updateRuntime(device, {
      streamState: result.status.state,
      streamSessionId: result.status.pid ? String(result.status.pid) : null,
      streamMessage: result.status.message,
      lastError: result.ok ? null : result.message
    })
    this.emit('stream', runtime, result.message)
    return result
  }

  public async stopStream(deviceId: string): Promise<ScrcpyStopResult> {
    const device = await this.getDevice(deviceId)
    const result = this.scrcpyService.stop(deviceId)
    const runtime = this.updateRuntime(device, {
      streamState: result.status.state,
      streamSessionId: result.status.pid ? String(result.status.pid) : null,
      streamMessage: result.status.message,
      lastError: result.ok ? null : result.message
    })
    this.emit('stream', runtime, result.message)
    return result
  }

  public async handleScrcpyEvent(event: ScrcpyProcessEvent): Promise<void> {
    if (!event.deviceId) return
    const device = await this.getDevice(event.deviceId)
    const runtime = this.updateRuntime(device, {
      streamState: event.status.state,
      streamSessionId: event.status.pid ? String(event.status.pid) : null,
      streamMessage: event.status.message,
      lastError: event.status.state === 'error' ? event.status.message : null
    })
    this.emit('stream', runtime, event.message)
  }

  private async syncConfiguredDevices(): Promise<void> {
    const state = await configurationService.load()
    const configuredIds = new Set(state.config.devices.map((device) => device.id))
    for (const device of state.config.devices) {
      this.ensureRuntime(device)
    }
    for (const deviceId of this.runtimeByDeviceId.keys()) {
      if (!configuredIds.has(deviceId)) {
        this.runtimeByDeviceId.delete(deviceId)
        this.reconnectAttempts.delete(deviceId)
      }
    }
  }

  private async getDevice(deviceId: string): Promise<DeviceConfig> {
    const state = await configurationService.load()
    const device = state.config.devices.find((item) => item.id === deviceId)
    if (!device) {
      throw new Error(`Unknown device id: ${deviceId}`)
    }
    return device
  }

  private ensureRuntime(device: DeviceConfig): DeviceRuntimeState {
    const existing = this.runtimeByDeviceId.get(device.id)
    if (existing) {
      if (existing.deviceAddress !== device.address) {
        const nextRuntime = {
          ...existing,
          deviceAddress: device.address
        }
        this.runtimeByDeviceId.set(device.id, nextRuntime)
        return nextRuntime
      }
      return existing
    }

    const runtime = createRuntime(device)
    this.runtimeByDeviceId.set(device.id, runtime)
    return runtime
  }

  private updateRuntime(
    device: DeviceConfig,
    changes: Partial<DeviceRuntimeState>
  ): DeviceRuntimeState {
    const runtime = {
      ...this.ensureRuntime(device),
      deviceAddress: device.address,
      ...changes
    }
    this.runtimeByDeviceId.set(device.id, runtime)
    return runtime
  }

  private getConnectionState(
    adbDevice: AdbDevice | undefined
  ): Pick<DeviceRuntimeState, 'connectionState' | 'connectionMessage'> {
    if (!adbDevice) {
      return { connectionState: 'disconnected', connectionMessage: 'Device is not connected.' }
    }
    if (adbDevice.state === 'device') {
      return { connectionState: 'connected', connectionMessage: 'Device is connected.' }
    }
    if (adbDevice.state === 'offline') {
      return { connectionState: 'offline', connectionMessage: 'Device is offline.' }
    }
    if (adbDevice.state === 'unauthorized') {
      return { connectionState: 'unauthorized', connectionMessage: 'Device is unauthorized.' }
    }
    return { connectionState: 'error', connectionMessage: `Device state is ${adbDevice.rawState}.` }
  }

  private startTimers(): void {
    if (!this.pollingTimer) {
      this.pollingTimer = setInterval(() => void this.pollConfiguredDevices(), RUNTIME_POLL_MS)
    }
    if (!this.reconnectTimer) {
      this.reconnectTimer = setInterval(() => void this.autoReconnectKnownDevices(), 5_000)
    }
  }

  private async pollConfiguredDevices(): Promise<void> {
    await this.syncConfiguredDevices()
    const state = await configurationService.load()
    const intervalMs = state.config.settings.runtimePollingIntervalSeconds * 1000
    const now = Date.now()
    await Promise.all(
      state.config.devices
        .filter((device) => {
          const runtime = this.ensureRuntime(device)
          const lastRefresh = runtime.lastRuntimeRefreshAt
          return !lastRefresh || now - Date.parse(lastRefresh) >= intervalMs
        })
        .map((device) => this.refreshRuntime(device.id))
    )
  }

  private async autoReconnectKnownDevices(): Promise<void> {
    await this.syncConfiguredDevices()
    const state = await configurationService.load()
    if (!state.config.settings.autoReconnect) {
      return
    }
    const resolver = createBinaryResolverFromSettings(state.config.settings)
    const devices = state.config.devices
    for (const device of devices) {
      const runtime = this.ensureRuntime(device)
      if (runtime.suspendedAutoReconnect || runtime.connectionState === 'connected') {
        continue
      }

      const attempt = this.reconnectAttempts.get(device.id) ?? 0
      const delay = AUTO_RECONNECT_DELAYS_MS[Math.min(attempt, AUTO_RECONNECT_DELAYS_MS.length - 1)]
      const lastRefresh = runtime.lastRuntimeRefreshAt ? Date.parse(runtime.lastRuntimeRefreshAt) : 0
      if (Date.now() - lastRefresh < delay) {
        continue
      }

      logger.debug('Auto reconnect attempt', {
        deviceId: device.id,
        address: device.address,
        attempt,
        delay
      })
      const result = await connectAdbDevice(device.address, resolver)
      this.reconnectAttempts.set(device.id, result.ok ? 0 : attempt + 1)
      this.updateRuntime(device, {
        connectionState: result.ok ? 'connected' : 'disconnected',
        connectionMessage: result.message,
        lastRuntimeRefreshAt: new Date().toISOString(),
        lastError: result.ok ? null : 'Auto reconnect failed.'
      })
      if (result.ok) {
        void this.refreshRuntime(device.id)
      }
    }
  }

  private async getBinaryResolver(): Promise<BinaryResolver> {
    const state = await configurationService.load()
    return createBinaryResolverFromSettings(state.config.settings)
  }

  private emit(
    type: DeviceRuntimeEvent['type'],
    runtime: DeviceRuntimeState,
    message: string
  ): void {
    this.emitRuntimeEvent({
      type,
      deviceId: runtime.deviceId,
      runtime,
      message,
      occurredAt: new Date().toISOString()
    })
  }
}
