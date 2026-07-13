export interface RefreshLockState {
  activeDeviceIds: ReadonlySet<string>
}

export interface AutoReconnectState {
  suspendedAutoReconnect: boolean
}

export const canStartRuntimeRefresh = (
  state: RefreshLockState,
  deviceId: string
): boolean => {
  return !state.activeDeviceIds.has(deviceId)
}

export const suspendAutoReconnectAfterManualDisconnect = <T extends AutoReconnectState>(
  state: T
): T => ({
  ...state,
  suspendedAutoReconnect: true
})

export const allowAutoReconnectAfterManualConnect = <T extends AutoReconnectState>(
  state: T
): T => ({
  ...state,
  suspendedAutoReconnect: false
})
