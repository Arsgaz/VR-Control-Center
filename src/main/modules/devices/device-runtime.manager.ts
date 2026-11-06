import type { AppConfig, DeviceConfig } from '@shared/contracts/config.contracts'
import type {
  AdbDevice,
  AdbDevicesResult,
  DeviceRuntimeEvent,
  DeviceRuntimeResult,
  DeviceRuntimeState,
  DeviceTimeSyncResult,
  ScrcpyProcessEvent,
  ScrcpyStartResult,
  ScrcpyStopResult
} from '@shared/contracts/headset.contracts'
import {
  connectAdbDevice,
  disconnectAdbDevice,
  getDeviceBattery,
  getForegroundApplication,
  listAdbDevices
} from '@main/infrastructure/adb/adb.service'
import { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'
import { synchronizeDeviceTime } from '@main/infrastructure/adb/device-time.service'
import { logger } from '@main/infrastructure/logging/logger'
import {
  createBinaryResolverFromSettings,
  type BinaryResolver
} from '@main/infrastructure/binaries/binary-resolver'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import {
  allowAutoReconnectAfterManualConnect,
  canStartRuntimeRefresh,
  suspendAutoReconnectAfterManualDisconnect
} from './device-runtime.policy'

const RUNTIME_POLL_MS = 1_000
const AUTO_RECONNECT_DELAYS_MS = [10_000, 20_000, 40_000, 60_000]
const BATTERY_INTERVAL_MS = 30_000
const BACKGROUND_BATTERY_INTERVAL_MS = 120_000
const BACKGROUND_FOREGROUND_INTERVAL_MS = 60_000
const MAX_TELEMETRY_COMMANDS = 2

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
  private readonly lastReconnectAt = new Map<string, number>()
  private readonly controlTasks = new Map<string, Promise<unknown>>()
  private readonly generations = new Map<string, number>()
  private readonly telemetryAt = new Map<string, { battery?: number; foreground?: number }>()
  private readonly connectionCheckedAt = new Map<string, number>()
  private readonly refreshOnResume = new Set<string>()
  private activeTelemetry = 0
  private readonly telemetryQueue: Array<() => void> = []
  private background = false
  private foregroundRefreshRequested = false
  private runtimePollingIntervalMs = 10_000
  private pollInProgress = false
  private reconnectInProgress = false
  private stopped = false
  private unsubscribeConfiguration: (() => void) | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pollingTimer: NodeJS.Timeout | null = null

  public constructor(
    private readonly emitRuntimeEvent: (event: DeviceRuntimeEvent) => void,
    private readonly scrcpyService: ScrcpyService,
    private readonly configurationService: ConfigurationService
  ) {}

  public async initialize(): Promise<void> {
    this.stopped = false
    await this.syncConfiguredDevices()
    this.unsubscribeConfiguration = this.configurationService.onDidChange((config) => {
      this.reconcileDevices(config)
    })
    this.startTimers()
    void this.autoReconnectKnownDevices().catch((error) =>
      logger.errorWithCause('Auto reconnect failed', error)
    )
  }

  public shutdown(): void {
    this.stopped = true
    this.unsubscribeConfiguration?.()
    this.unsubscribeConfiguration = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pollingTimer) clearTimeout(this.pollingTimer)
    this.reconnectTimer = null
    this.pollingTimer = null
  }

  public setBackgroundMode(background: boolean): void {
    if (this.stopped || this.background === background) return
    this.background = background
    if (!background) {
      this.foregroundRefreshRequested = true
      void this.pollConfiguredDevices().catch((error) =>
        logger.errorWithCause('Foreground runtime refresh failed', error)
      )
    }
  }

  public async getRuntime(deviceId: string): Promise<DeviceRuntimeState> {
    const device = await this.getDevice(deviceId)
    return this.ensureRuntime(device)
  }

  public syncTime(deviceId: string): Promise<DeviceTimeSyncResult> {
    const generation = this.generations.get(deviceId) ?? 0
    return this.enqueueControl(deviceId, async () => {
      const state = await this.configurationService.load()
      const device = state.config.devices.find((item) => item.id === deviceId)
      if (!device) return { ok: false, code: 'DEVICE_NOT_FOUND' }
      if (!this.isCurrent(device, generation)) return { ok: false, code: 'SUPERSEDED' }
      const result = await synchronizeDeviceTime(
        device.address,
        createBinaryResolverFromSettings(state.config.settings),
        () => this.isCurrent(device, generation)
      )
      return this.isCurrent(device, generation) ? result : { ok: false, code: 'SUPERSEDED' }
    })
  }

  public async connect(deviceId: string): Promise<DeviceRuntimeResult> {
    const generation = this.invalidate(deviceId)
    const result = await this.enqueueControl(deviceId, () =>
      this.connectDevice(deviceId, generation)
    )
    if (result.ok)
      void this.refreshRuntime(deviceId).catch((error) =>
        logger.errorWithCause('Runtime refresh failed', error)
      )
    return result
  }

  private async connectDevice(deviceId: string, generation: number): Promise<DeviceRuntimeResult> {
    const device = await this.getDevice(deviceId)
    const resolver = await this.getBinaryResolver()
    if (!this.isCurrent(device, generation)) return this.superseded(device)
    const previousRuntime = this.ensureRuntime(device)
    this.updateRuntime(device, allowAutoReconnectAfterManualConnect(previousRuntime))
    const result = await connectAdbDevice(device.address, resolver)
    if (!this.isCurrent(device, generation)) return this.superseded(device)
    const runtime = this.updateRuntime(device, {
      connectionState: result.ok ? 'connected' : 'error',
      connectionMessage: result.message,
      lastError: result.ok ? null : 'ADB connection failed.',
      lastRuntimeRefreshAt: new Date().toISOString(),
      lastSuccessfulRuntimeRefreshAt: result.ok
        ? new Date().toISOString()
        : previousRuntime.lastSuccessfulRuntimeRefreshAt
    })
    this.reconnectAttempts.set(deviceId, 0)
    this.emit('connection', runtime, result.message)
    return { ok: result.ok, runtime, message: result.message }
  }

  public disconnect(deviceId: string): Promise<DeviceRuntimeResult> {
    const generation = this.invalidate(deviceId)
    const current = this.runtimeByDeviceId.get(deviceId)
    if (current)
      this.runtimeByDeviceId.set(deviceId, suspendAutoReconnectAfterManualDisconnect(current))
    return this.enqueueControl(deviceId, () => this.disconnectDevice(deviceId, generation))
  }

  private async disconnectDevice(
    deviceId: string,
    generation: number
  ): Promise<DeviceRuntimeResult> {
    const device = await this.getDevice(deviceId)
    const resolver = await this.getBinaryResolver()
    if (!this.isCurrent(device, generation)) return this.superseded(device)
    this.updateRuntime(
      device,
      suspendAutoReconnectAfterManualDisconnect(this.ensureRuntime(device))
    )
    const stopped = await this.scrcpyService.stopAndWait(deviceId)
    if (!this.isCurrent(device, generation)) return this.superseded(device)
    const result = await disconnectAdbDevice(device.address, resolver)
    if (!this.isCurrent(device, generation)) return this.superseded(device)
    const stream = this.scrcpyService.getStatus(deviceId)
    const ok = result.ok && !stream.running
    const message = stream.running ? `${result.message}; ${stopped.message}` : result.message
    const runtime = this.updateRuntime(device, {
      connectionState: result.ok ? 'disconnected' : 'error',
      connectionMessage: message,
      streamState: stream.state,
      streamSessionId: stream.running && stream.pid ? String(stream.pid) : null,
      streamMessage: stream.message,
      lastError: ok ? null : message,
      lastRuntimeRefreshAt: new Date().toISOString()
    })
    this.emit('connection', runtime, message)
    return { ok, runtime, message }
  }

  public async refreshRuntime(deviceId: string): Promise<DeviceRuntimeResult> {
    return this.refreshDeviceRuntime(deviceId)
  }

  private async refreshDeviceRuntime(
    deviceId: string,
    snapshot?: {
      generation: number
      read: (resolver: BinaryResolver) => Promise<AdbDevicesResult>
      forceTelemetry?: boolean
    }
  ): Promise<DeviceRuntimeResult> {
    const device = await this.getDevice(deviceId)
    const generation = snapshot?.generation ?? this.generations.get(deviceId) ?? 0
    if (!this.isCurrent(device, generation)) return this.superseded(device)
    if (
      this.controlTasks.has(deviceId) ||
      !canStartRuntimeRefresh({ activeDeviceIds: this.refreshInProgress }, deviceId)
    ) {
      const runtime = await this.getRuntime(deviceId)
      return { ok: true, runtime, message: 'Runtime refresh is already in progress' }
    }

    this.refreshInProgress.add(deviceId)
    this.updateRuntime(device, { isRuntimeRefreshInProgress: true })

    try {
      const now = new Date().toISOString()
      const resolver = await this.getBinaryResolver()
      if (!this.isCurrent(device, generation)) return this.superseded(device)
      const devices = await (snapshot ? snapshot.read(resolver) : listAdbDevices(resolver))
      if (!this.isCurrent(device, generation)) return this.superseded(device)
      const adbDevice = devices.devices.find((item) => item.serial === device.address)
      const connection = this.getConnectionState(adbDevice)

      if (connection.connectionState !== 'connected') {
        this.telemetryAt.delete(deviceId)
        const runtime = this.updateRuntime(device, {
          ...connection,
          lastRuntimeRefreshAt: now,
          isRuntimeRefreshInProgress: false
        })
        this.emit('runtime', runtime, connection.connectionMessage)
        return { ok: false, runtime, message: connection.connectionMessage }
      }

      // Make a newly discovered transport usable before it waits for telemetry.
      if (this.runtimeByDeviceId.get(deviceId)?.connectionState !== 'connected') {
        this.emit(
          'connection',
          this.updateRuntime(device, connection),
          connection.connectionMessage
        )
      }

      const last = this.telemetryAt.get(deviceId) ?? {}
      const time = Date.now()
      const force = !snapshot || snapshot.forceTelemetry
      const batteryInterval = this.background ? BACKGROUND_BATTERY_INTERVAL_MS : BATTERY_INTERVAL_MS
      const foregroundInterval = this.background
        ? Math.max(BACKGROUND_FOREGROUND_INTERVAL_MS, this.runtimePollingIntervalMs)
        : this.runtimePollingIntervalMs
      const batteryDue =
        force || last.battery === undefined || time - last.battery >= batteryInterval
      const foregroundDue =
        force || last.foreground === undefined || time - last.foreground >= foregroundInterval
      if (!batteryDue && !foregroundDue) {
        return {
          ok: true,
          runtime: this.updateRuntime(device, { isRuntimeRefreshInProgress: false }),
          message: 'Telemetry is up to date'
        }
      }
      const query = <T>(task: () => Promise<T>) =>
        this.queryTelemetry(async () => {
          if (!this.isCurrent(device, generation)) throw new Error('Telemetry superseded')
          return task()
        }, !snapshot)
      const [batteryResult, foregroundResult] = await Promise.allSettled([
        batteryDue ? query(() => getDeviceBattery(device.address, resolver)) : Promise.resolve({}),
        foregroundDue
          ? query(() => getForegroundApplication(device.address, resolver))
          : Promise.resolve({})
      ])
      if (!this.isCurrent(device, generation)) return this.superseded(device)
      this.telemetryAt.set(deviceId, {
        battery: batteryDue ? Date.now() : last.battery,
        foreground: foregroundDue ? Date.now() : last.foreground
      })

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
      if (!this.isCurrent(device, generation)) return this.superseded(device)
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
      if (this.refreshOnResume.delete(deviceId) && !this.background && !this.stopped) {
        void this.refreshRuntime(deviceId).catch((error) =>
          logger.errorWithCause('Resumed telemetry refresh failed', error)
        )
      }
    }
  }

  public startStream(deviceId: string): Promise<ScrcpyStartResult> {
    const generation = this.generations.get(deviceId) ?? 0
    return this.enqueueControl(deviceId, () => this.startDeviceStream(deviceId, generation))
  }

  private async startDeviceStream(
    deviceId: string,
    generation: number
  ): Promise<ScrcpyStartResult> {
    const state = await this.configurationService.load()
    const device = state.config.devices.find((item) => item.id === deviceId)
    if (!device) throw new Error(`Unknown device id: ${deviceId}`)
    if (!this.isCurrent(device, generation)) throw new Error('Stream start was superseded')
    const profile =
      state.config.streamProfiles.find((item) => item.id === device.streamProfileId) ??
      state.config.streamProfiles[0] ??
      null
    const resolver = createBinaryResolverFromSettings(state.config.settings)
    const devices = await listAdbDevices(resolver)
    if (!this.isCurrent(device, generation)) throw new Error('Stream start was superseded')
    if (
      !devices.devices.some((item) => item.serial === device.address && item.state === 'device')
    ) {
      throw new Error('Device is not connected')
    }
    this.scrcpyService.setBinaryResolver(resolver)

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

  public stopStream(deviceId: string): Promise<ScrcpyStopResult> {
    const generation = this.generations.get(deviceId) ?? 0
    return this.enqueueControl(deviceId, () => this.stopDeviceStream(deviceId, generation))
  }

  private async stopDeviceStream(deviceId: string, generation: number): Promise<ScrcpyStopResult> {
    const device = await this.getDevice(deviceId)
    if (!this.isCurrent(device, generation)) throw new Error('Stream stop was superseded')
    const result = await this.scrcpyService.stopAndWait(deviceId)
    if (!this.isCurrent(device, generation)) return result
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
    if (!event.deviceId || event.type === 'stdout' || event.type === 'stderr') return
    const generation = this.generations.get(event.deviceId) ?? 0
    const state = await this.configurationService.load()
    const device = state.config.devices.find((item) => item.id === event.deviceId)
    if (
      !device ||
      !this.isCurrent(device, generation) ||
      device.address !== event.status.address ||
      this.scrcpyService.getStatus(device.id) !== event.status
    )
      return
    const runtime = this.updateRuntime(device, {
      streamState: event.status.state,
      streamSessionId: event.status.pid ? String(event.status.pid) : null,
      streamMessage: event.status.message,
      lastError: event.status.state === 'error' ? event.status.message : null
    })
    this.emit('stream', runtime, event.message)
  }

  private async syncConfiguredDevices(): Promise<void> {
    const state = await this.configurationService.load()
    this.reconcileDevices(state.config)
  }

  private reconcileDevices(config: AppConfig): void {
    this.runtimePollingIntervalMs = config.settings.runtimePollingIntervalSeconds * 1000
    const devices = new Map(config.devices.map((device) => [device.id, device]))
    for (const [id, runtime] of this.runtimeByDeviceId) {
      if (devices.get(id)?.address !== runtime.deviceAddress) {
        this.invalidate(id)
        this.scrcpyService.stop(id)
        this.runtimeByDeviceId.delete(id)
        this.reconnectAttempts.delete(id)
        this.lastReconnectAt.delete(id)
      }
    }
    for (const device of config.devices) this.ensureRuntime(device)
  }

  private async getDevice(deviceId: string): Promise<DeviceConfig> {
    const state = await this.configurationService.load()
    const device = state.config.devices.find((item) => item.id === deviceId)
    if (!device) {
      throw new Error(`Unknown device id: ${deviceId}`)
    }
    return device
  }

  private invalidate(deviceId: string): number {
    this.telemetryAt.delete(deviceId)
    this.connectionCheckedAt.delete(deviceId)
    this.refreshOnResume.delete(deviceId)
    const generation = (this.generations.get(deviceId) ?? 0) + 1
    this.generations.set(deviceId, generation)
    const runtime = this.runtimeByDeviceId.get(deviceId)
    if (runtime)
      this.runtimeByDeviceId.set(deviceId, { ...runtime, isRuntimeRefreshInProgress: false })
    return generation
  }

  private isCurrent(device: DeviceConfig, generation: number): boolean {
    return (
      !this.stopped &&
      (this.generations.get(device.id) ?? 0) === generation &&
      this.runtimeByDeviceId.get(device.id)?.deviceAddress === device.address
    )
  }

  private superseded(device: DeviceConfig): DeviceRuntimeResult {
    return {
      ok: false,
      runtime: this.runtimeByDeviceId.get(device.id) ?? createRuntime(device),
      message: 'Device operation was superseded'
    }
  }

  private enqueueControl<T>(deviceId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.controlTasks.get(deviceId) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (this.controlTasks.get(deviceId) === next) this.controlTasks.delete(deviceId)
      })
    this.controlTasks.set(deviceId, next)
    return next
  }

  private async queryTelemetry<T>(task: () => Promise<T>, priority: boolean): Promise<T> {
    await new Promise<void>((resolve) => {
      const reserve = (): void => {
        this.activeTelemetry++
        resolve()
      }
      if (this.activeTelemetry < MAX_TELEMETRY_COMMANDS) reserve()
      else if (priority) this.telemetryQueue.unshift(reserve)
      else this.telemetryQueue.push(reserve)
    })
    try {
      return await task()
    } finally {
      this.activeTelemetry--
      this.telemetryQueue.shift()?.()
    }
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
    const current = this.runtimeByDeviceId.get(device.id)
    if (this.stopped || !current || current.deviceAddress !== device.address) {
      return { ...createRuntime(device), ...changes }
    }
    const runtime = {
      ...current,
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
      this.pollingTimer = setInterval(() => {
        void this.pollConfiguredDevices().catch((error) =>
          logger.errorWithCause('Runtime polling failed', error)
        )
      }, RUNTIME_POLL_MS)
    }
    if (!this.reconnectTimer) {
      this.reconnectTimer = setInterval(
        () =>
          void this.autoReconnectKnownDevices().catch((error) =>
            logger.errorWithCause('Auto reconnect failed', error)
          ),
        5_000
      )
    }
  }

  private async pollConfiguredDevices(): Promise<void> {
    if (this.stopped || this.pollInProgress) return
    this.pollInProgress = true
    const forceTelemetry = this.foregroundRefreshRequested
    this.foregroundRefreshRequested = false
    try {
      await this.syncConfiguredDevices()
      const state = await this.configurationService.load()
      const intervalMs = state.config.settings.runtimePollingIntervalSeconds * 1000
      const now = Date.now()
      // Discovery must not wait for queued dumpsys commands. Only the shared
      // transport snapshot belongs to this round; telemetry drains separately.
      const due = state.config.devices
        .filter((device) => {
          const last = this.connectionCheckedAt.get(device.id)
          return (
            !this.controlTasks.has(device.id) &&
            (forceTelemetry || last === undefined || now - last >= intervalMs)
          )
        })
        .map((device) => ({ device, generation: this.generations.get(device.id) ?? 0 }))
      if (!due.length) return
      let listing: AdbDevicesResult
      try {
        listing = await listAdbDevices(createBinaryResolverFromSettings(state.config.settings))
      } catch (error) {
        for (const { device, generation } of due) {
          if (!this.isCurrent(device, generation) || this.controlTasks.has(device.id)) continue
          this.invalidate(device.id)
          this.connectionCheckedAt.set(device.id, Date.now())
          const runtime = this.updateRuntime(device, {
            connectionState: 'error',
            connectionMessage: 'Connection check failed.',
            lastError: 'Connection check failed.',
            lastRuntimeRefreshAt: new Date().toISOString()
          })
          this.emit('connection', runtime, 'Connection check failed')
        }
        logger.errorWithCause('ADB connection check failed', error)
        return
      }
      for (const { device, generation } of due) {
        if (!this.isCurrent(device, generation) || this.controlTasks.has(device.id)) continue
        const connection = this.getConnectionState(
          listing.devices.find((item) => item.serial === device.address)
        )
        if (connection.connectionState !== 'connected') {
          // Invalidate reads that started before the transport disappeared.
          this.invalidate(device.id)
          this.connectionCheckedAt.set(device.id, Date.now())
          const runtime = this.updateRuntime(device, {
            ...connection,
            lastRuntimeRefreshAt: new Date().toISOString()
          })
          this.emit('connection', runtime, connection.connectionMessage)
          continue
        }
        this.connectionCheckedAt.set(device.id, Date.now())
        const runtime = this.updateRuntime(device, {
          ...connection,
          lastRuntimeRefreshAt: new Date().toISOString()
        })
        this.emit('connection', runtime, connection.connectionMessage)
        if (forceTelemetry && this.refreshInProgress.has(device.id))
          this.refreshOnResume.add(device.id)
        void this.refreshDeviceRuntime(device.id, {
          generation,
          read: () => Promise.resolve(listing),
          forceTelemetry
        }).catch((error) =>
          logger.errorWithCause('Telemetry refresh failed', error, { deviceId: device.id })
        )
      }
    } finally {
      this.pollInProgress = false
      if (this.foregroundRefreshRequested && !this.stopped) {
        void this.pollConfiguredDevices().catch((error) =>
          logger.errorWithCause('Foreground runtime refresh failed', error)
        )
      }
    }
  }

  private async autoReconnectKnownDevices(): Promise<void> {
    if (this.stopped || this.reconnectInProgress) return
    this.reconnectInProgress = true
    try {
      await this.syncConfiguredDevices()
      const state = await this.configurationService.load()
      if (!state.config.settings.autoReconnect) {
        return
      }
      const devices = state.config.devices
      const pending = [...devices]
      const worker = async (): Promise<void> => {
        while (pending.length && !this.stopped) {
          const device = pending.shift()!
          const runtime = this.runtimeByDeviceId.get(device.id)
          if (
            !runtime ||
            runtime.deviceAddress !== device.address ||
            this.controlTasks.has(device.id) ||
            runtime.suspendedAutoReconnect ||
            runtime.connectionState === 'connected'
          )
            continue
          const attempt = this.reconnectAttempts.get(device.id) ?? 0
          const delay =
            AUTO_RECONNECT_DELAYS_MS[Math.min(attempt, AUTO_RECONNECT_DELAYS_MS.length - 1)]
          if (Date.now() - (this.lastReconnectAt.get(device.id) ?? 0) < delay) continue
          this.lastReconnectAt.set(device.id, Date.now())
          const generation = this.invalidate(device.id)
          try {
            const result = await this.enqueueControl(device.id, () =>
              this.connectDevice(device.id, generation)
            )
            if (!this.isCurrent(device, generation)) continue
            this.reconnectAttempts.set(device.id, result.ok ? 0 : attempt + 1)
            if (result.ok)
              void this.refreshRuntime(device.id).catch((error) =>
                logger.errorWithCause('Runtime refresh failed', error)
              )
          } catch (error) {
            if (!this.isCurrent(device, generation)) continue
            this.reconnectAttempts.set(device.id, attempt + 1)
            const updated = this.updateRuntime(device, {
              connectionState: 'error',
              connectionMessage: 'Auto reconnect failed.',
              lastError: 'Auto reconnect failed.',
              lastRuntimeRefreshAt: new Date().toISOString()
            })
            this.emit('connection', updated, 'Auto reconnect failed')
            logger.errorWithCause('Auto reconnect failed', error, { deviceId: device.id })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, devices.length) }, worker))
    } finally {
      this.reconnectInProgress = false
    }
  }

  private async getBinaryResolver(): Promise<BinaryResolver> {
    const state = await this.configurationService.load()
    return createBinaryResolverFromSettings(state.config.settings)
  }

  private emit(
    type: DeviceRuntimeEvent['type'],
    runtime: DeviceRuntimeState,
    message: string
  ): void {
    if (this.stopped || this.runtimeByDeviceId.get(runtime.deviceId) !== runtime) return
    this.emitRuntimeEvent({
      type,
      deviceId: runtime.deviceId,
      runtime,
      message,
      occurredAt: new Date().toISOString()
    })
  }
}
