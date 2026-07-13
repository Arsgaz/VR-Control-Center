import type { DeviceRuntimeState } from '../../../../shared/contracts/headset.contracts'

export type DeviceOperation =
  | 'connect'
  | 'disconnect'
  | 'refreshRuntime'
  | 'startScrcpy'
  | 'stopScrcpy'

export interface DeviceActionPresentation {
  label: string
  labelKey: string
  disabled: boolean
  action: 'connect' | 'disconnect' | 'startStream' | 'stopStream'
  tone: 'primary' | 'secondary' | 'danger'
}

export const getConnectionStatusLabel = (
  runtime: Pick<DeviceRuntimeState, 'connectionState'>,
  operation: DeviceOperation | null
): string => {
  if (operation === 'connect') {
    return 'Connecting'
  }

  if (operation === 'disconnect') {
    return 'Disconnecting'
  }

  if (runtime.connectionState === 'connected') {
    return 'Connected'
  }

  if (runtime.connectionState === 'error') {
    return 'Connection error'
  }

  if (runtime.connectionState === 'unauthorized') {
    return 'Unauthorized'
  }

  if (runtime.connectionState === 'offline') {
    return 'Offline'
  }

  return 'Offline'
}

export const getStreamStatusLabel = (
  runtime: Pick<DeviceRuntimeState, 'streamState'>,
  operation: DeviceOperation | null
): string => {
  if (operation === 'startScrcpy') {
    return 'Starting stream'
  }

  if (operation === 'stopScrcpy') {
    return 'Stopping stream'
  }

  if (runtime.streamState === 'running') {
    return 'Streaming'
  }

  if (runtime.streamState === 'error') {
    return 'Stream failed'
  }

  return 'Not streaming'
}

export const getConnectionAction = (
  runtime: Pick<DeviceRuntimeState, 'connectionState'>,
  operation: DeviceOperation | null,
  isAdbAvailable: boolean
): DeviceActionPresentation => {
  if (operation === 'connect') {
    return { label: 'Connecting...', labelKey: 'common.actions.connecting', disabled: true, action: 'connect', tone: 'primary' }
  }

  if (operation === 'disconnect') {
    return { label: 'Disconnecting...', labelKey: 'common.actions.disconnecting', disabled: true, action: 'disconnect', tone: 'secondary' }
  }

  if (runtime.connectionState === 'connected') {
    return {
      label: 'Disconnect',
      labelKey: 'common.actions.disconnect',
      disabled: !isAdbAvailable,
      action: 'disconnect',
      tone: 'secondary'
    }
  }

  return {
    label: 'Connect',
    labelKey: 'common.actions.connect',
    disabled: !isAdbAvailable,
    action: 'connect',
    tone: 'primary'
  }
}

export const getStreamAction = (
  runtime: Pick<DeviceRuntimeState, 'connectionState' | 'streamState'>,
  operation: DeviceOperation | null,
  isScrcpyAvailable: boolean,
  isAnyStreamRunning: boolean,
  isThisStreamRunning: boolean
): DeviceActionPresentation => {
  if (operation === 'startScrcpy') {
    return { label: 'Starting...', labelKey: 'devices.actions.starting', disabled: true, action: 'startStream', tone: 'primary' }
  }

  if (operation === 'stopScrcpy') {
    return { label: 'Stopping...', labelKey: 'devices.actions.stopping', disabled: true, action: 'stopStream', tone: 'danger' }
  }

  if (isThisStreamRunning || runtime.streamState === 'running') {
    return {
      label: 'Stop stream',
      labelKey: 'devices.actions.stopStream',
      disabled: !isThisStreamRunning,
      action: 'stopStream',
      tone: 'danger'
    }
  }

  return {
    label: 'Start stream',
    labelKey: 'devices.actions.startStream',
    disabled: !isScrcpyAvailable || isAnyStreamRunning || runtime.connectionState !== 'connected',
    action: 'startStream',
    tone: 'primary'
  }
}

export const getBatteryLabel = (
  batteryLevel: number | null,
  isCharging: boolean | null
): string => {
  if (batteryLevel === null) {
    return '-'
  }

  return `${batteryLevel}%${isCharging ? ' charging' : ''}`
}

export const getApplicationLabel = (
  foregroundApplicationName: string | null,
  foregroundPackage: string | null
): string => {
  return foregroundApplicationName?.trim() || foregroundPackage?.trim() || 'Unknown'
}
