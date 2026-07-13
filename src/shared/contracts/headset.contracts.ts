export const HEADSET_IPC_CHANNELS = {
  checkEnvironment: 'headset:check-environment',
  listAdbDevices: 'headset:list-adb-devices',
  connectDevice: 'headset:connect-device',
  disconnectDevice: 'headset:disconnect-device',
  startScrcpy: 'headset:start-scrcpy',
  stopScrcpy: 'headset:stop-scrcpy',
  getScrcpyStatus: 'headset:get-scrcpy-status',
  scrcpyEvent: 'headset:scrcpy-event'
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
}

export type ScrcpyStreamState = 'stopped' | 'starting' | 'running' | 'stopping' | 'exited' | 'error'

export interface ScrcpyStatus {
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
  message: string
  status: ScrcpyStatus
  occurredAt: string
}

export interface HeadsetApi {
  checkEnvironment: () => Promise<EnvironmentCheck>
  listAdbDevices: () => Promise<AdbDevicesResult>
  connectDevice: (address: string) => Promise<AdbCommandResult>
  disconnectDevice: (address: string) => Promise<AdbCommandResult>
  startScrcpy: (options: ScrcpyStartOptions) => Promise<ScrcpyStartResult>
  stopScrcpy: () => Promise<ScrcpyStopResult>
  getScrcpyStatus: () => Promise<ScrcpyStatus>
  onScrcpyEvent: (callback: (event: ScrcpyProcessEvent) => void) => () => void
}
