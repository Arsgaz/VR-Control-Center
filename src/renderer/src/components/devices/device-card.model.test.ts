import { describe, expect, it } from 'vitest'
import type { DeviceRuntimeState } from '../../../../shared/contracts/headset.contracts'
import {
  getApplicationLabel,
  getBatteryLabel,
  getConnectionAction,
  getStreamAction
} from './device-card.model'
import {
  createEmptyDeviceOverlaySelection,
  openDiagnosticsOverlay,
  openLaunchGameOverlay
} from './device-overlay.model'

const createRuntime = (changes: Partial<DeviceRuntimeState> = {}): DeviceRuntimeState => ({
  deviceId: 'quest-1',
  deviceAddress: '10.0.0.2:5555',
  connectionState: 'unknown',
  connectionMessage: 'Not checked',
  streamState: 'stopped',
  streamSessionId: null,
  streamMessage: 'Not streaming',
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
  suspendedAutoReconnect: false,
  ...changes
})

describe('device card presentation model', () => {
  it('selects Connect or Disconnect from connection runtime state', () => {
    expect(getConnectionAction(createRuntime({ connectionState: 'unknown' }), null, true)).toMatchObject({
      label: 'Connect',
      action: 'connect',
      disabled: false
    })

    expect(
      getConnectionAction(createRuntime({ connectionState: 'connected' }), null, true)
    ).toMatchObject({
      label: 'Disconnect',
      action: 'disconnect',
      disabled: false
    })
  })

  it('disables connection action during transition operations', () => {
    expect(getConnectionAction(createRuntime(), 'connect', true)).toMatchObject({
      label: 'Connecting...',
      disabled: true
    })

    expect(
      getConnectionAction(createRuntime({ connectionState: 'connected' }), 'disconnect', true)
    ).toMatchObject({
      label: 'Disconnecting...',
      disabled: true
    })
  })

  it('selects Start or Stop stream from stream runtime state', () => {
    expect(
      getStreamAction(
        createRuntime({ connectionState: 'connected', streamState: 'stopped' }),
        null,
        true,
        false,
        false
      )
    ).toMatchObject({
      label: 'Start stream',
      action: 'startStream',
      disabled: false
    })

    expect(
      getStreamAction(
        createRuntime({ connectionState: 'connected', streamState: 'running' }),
        null,
        true,
        true,
        true
      )
    ).toMatchObject({
      label: 'Stop stream',
      action: 'stopStream',
      disabled: false
    })
  })

  it('disables stream actions while starting or stopping', () => {
    expect(
      getStreamAction(createRuntime({ connectionState: 'connected' }), 'startScrcpy', true, false, false)
    ).toMatchObject({
      label: 'Starting...',
      disabled: true
    })

    expect(
      getStreamAction(
        createRuntime({ connectionState: 'connected', streamState: 'running' }),
        'stopScrcpy',
        true,
        true,
        true
      )
    ).toMatchObject({
      label: 'Stopping...',
      disabled: true
    })
  })

  it('does not allow stream start without ADB connection', () => {
    expect(
      getStreamAction(createRuntime({ connectionState: 'disconnected' }), null, true, false, false)
    ).toMatchObject({
      label: 'Start stream',
      disabled: true
    })
  })

  it('renders placeholders for unknown battery and foreground application', () => {
    expect(getBatteryLabel(null, null)).toBe('-')
    expect(getApplicationLabel(null, null)).toBe('Unknown')
  })

  it('opens launch game and diagnostics overlays for the selected device id', () => {
    const emptySelection = createEmptyDeviceOverlaySelection()

    expect(openLaunchGameOverlay(emptySelection, 'quest-1').launchGameDeviceId).toBe('quest-1')
    expect(openDiagnosticsOverlay(emptySelection, 'quest-2').diagnosticsDeviceId).toBe('quest-2')
  })
})
