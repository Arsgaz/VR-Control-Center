export interface DeviceOverlaySelection {
  launchGameDeviceId: string | null
  diagnosticsDeviceId: string | null
}

export const createEmptyDeviceOverlaySelection = (): DeviceOverlaySelection => ({
  launchGameDeviceId: null,
  diagnosticsDeviceId: null
})

export const openLaunchGameOverlay = (
  selection: DeviceOverlaySelection,
  deviceId: string
): DeviceOverlaySelection => ({
  ...selection,
  launchGameDeviceId: deviceId
})

export const openDiagnosticsOverlay = (
  selection: DeviceOverlaySelection,
  deviceId: string
): DeviceOverlaySelection => ({
  ...selection,
  diagnosticsDeviceId: deviceId
})
