export const HEADSET_IPC_CHANNELS = {
  checkEnvironment: 'headset:check-environment',
  listAdbDevices: 'headset:list-adb-devices',
  connectDevice: 'headset:connect-device',
  disconnectDevice: 'headset:disconnect-device',
  refreshRuntime: 'headset:refresh-runtime',
  syncTime: 'headset:sync-time',
  connectUsb: 'headset:connect-usb',
  startScrcpy: 'headset:start-scrcpy',
  stopScrcpy: 'headset:stop-scrcpy',
  getScrcpyStatus: 'headset:get-scrcpy-status',
  scrcpyEvent: 'headset:scrcpy-event',
  runtimeEvent: 'headset:runtime-event'
} as const

export type ToolName = 'adb' | 'scrcpy'

export interface ToolCheck {
  name: ToolName
  available: boolean
  version: string | null
  message: string
  stdout: string
  stderr: string
}

export interface EnvironmentCheck {
  adb: ToolCheck
  scrcpy: ToolCheck
}

export type AdbDeviceState = 'device' | 'offline' | 'unauthorized' | 'unknown'

export interface AdbDevice {
  model?: string
  serial: string
  state: AdbDeviceState
  rawState: string
}

export interface AdbDevicesResult {
  devices: AdbDevice[]
  stdout: string
  stderr: string
}

export interface AdbCommandResult {
  ok: boolean
  message: string
  stdout: string
  stderr: string
}

export interface ScrcpyStartOptions {
  address: string
  noAudio: boolean
  crop?: string
  maxSize?: number | null
  maxFps?: number | null
  videoBitRate?: string
  videoCodec?: 'h264' | 'h265'
}

export type ScrcpyStreamState = 'stopped' | 'starting' | 'running' | 'stopping' | 'exited' | 'error'

export interface ScrcpyStatus {
  deviceId: string | null
  state: ScrcpyStreamState
  running: boolean
  pid: number | null
  address: string | null
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
  signal: string | null
  message: string
}

export interface ScrcpyStartResult {
  ok: boolean
  status: ScrcpyStatus
  message: string
}

export interface ScrcpyStopResult {
  ok: boolean
  status: ScrcpyStatus
  message: string
}

export interface ScrcpyProcessEvent {
  type: 'stdout' | 'stderr' | 'exit' | 'error' | 'status'
  deviceId: string | null
  message: string
  status: ScrcpyStatus
  occurredAt: string
}

export type DeviceConnectionState =
  'unknown' | 'connected' | 'disconnected' | 'offline' | 'unauthorized' | 'error'

export type BatteryStatus = 'unknown' | 'charging' | 'discharging' | 'not-charging' | 'full' | null

export interface DeviceRuntimeState {
  deviceId: string
  deviceAddress: string
  connectionState: DeviceConnectionState
  connectionMessage: string
  streamState: ScrcpyStreamState
  streamSessionId: string | null
  streamMessage: string
  batteryLevel: number | null
  batteryStatus: BatteryStatus
  isCharging: boolean | null
  batteryTemperatureCelsius: number | null
  batteryVoltageMillivolts: number | null
  foregroundPackage: string | null
  foregroundActivity: string | null
  foregroundApplicationName: string | null
  lastRuntimeRefreshAt: string | null
  lastSuccessfulRuntimeRefreshAt: string | null
  lastError: string | null
  isRuntimeRefreshInProgress: boolean
  suspendedAutoReconnect: boolean
}

export interface DeviceRuntimeResult {
  ok: boolean
  runtime: DeviceRuntimeState
  message: string
}

export type DeviceTimeSyncError =
  | 'DEVICE_NOT_FOUND'
  | 'NOT_CONNECTED'
  | 'PERMISSION_DENIED'
  | 'SET_FAILED'
  | 'VERIFY_FAILED'
  | 'COMMAND_FAILED'
  | 'SUPERSEDED'

export type DeviceTimeSyncResult =
  | {
      ok: true
      address: string
      computerTimeMs: number
      deviceTimeMs: number
      differenceMs: number
    }
  | { ok: false; code: DeviceTimeSyncError }

export interface DeviceRuntimeEvent {
  type: 'runtime' | 'connection' | 'stream'
  deviceId: string
  runtime: DeviceRuntimeState
  message: string
  occurredAt: string
}

export interface HeadsetApi {
  connectUsb: (serial?: string) => Promise<UsbConnectionResult>
  checkEnvironment: () => Promise<EnvironmentCheck>
  listAdbDevices: () => Promise<AdbDevicesResult>
  connectDevice: (deviceId: string) => Promise<DeviceRuntimeResult>
  disconnectDevice: (deviceId: string) => Promise<DeviceRuntimeResult>
  refreshRuntime: (deviceId: string) => Promise<DeviceRuntimeResult>
  syncTime: (deviceId: string) => Promise<DeviceTimeSyncResult>
  startScrcpy: (deviceId: string) => Promise<ScrcpyStartResult>
  stopScrcpy: (deviceId: string) => Promise<ScrcpyStopResult>
  getScrcpyStatus: (deviceId: string) => Promise<ScrcpyStatus>
  onScrcpyEvent: (callback: (event: ScrcpyProcessEvent) => void) => () => void
  onRuntimeEvent: (callback: (event: DeviceRuntimeEvent) => void) => () => void
}

export type UsbConnectionError =
  | 'BUSY'
  | 'NO_USB'
  | 'UNAUTHORIZED'
  | 'OFFLINE'
  | 'DEVICE_CHANGED'
  | 'NO_WIFI'
  | 'TCPIP_FAILED'
  | 'CONNECT_FAILED'
  | 'COMMAND_FAILED'
export type UsbConnectionResult =
  | { status: 'select'; devices: AdbDevice[] }
  | { status: 'connected'; address: string; name: string }
  | { status: 'error'; code: UsbConnectionError }
