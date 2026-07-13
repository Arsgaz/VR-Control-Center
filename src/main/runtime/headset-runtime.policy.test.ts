import { describe, expect, it } from 'vitest'
import {
  allowAutoReconnectAfterManualConnect,
  canStartRuntimeRefresh,
  suspendAutoReconnectAfterManualDisconnect
} from './headset-runtime.policy'

describe('headset runtime policy', () => {
  it('prevents overlapping refresh for the same device', () => {
    expect(
      canStartRuntimeRefresh({ activeDeviceIds: new Set(['quest-1']) }, 'quest-1')
    ).toBe(false)
  })

  it('allows parallel refresh for different devices', () => {
    expect(
      canStartRuntimeRefresh({ activeDeviceIds: new Set(['quest-1']) }, 'quest-2')
    ).toBe(true)
  })

  it('suspends auto-reconnect after manual disconnect', () => {
    expect(
      suspendAutoReconnectAfterManualDisconnect({ suspendedAutoReconnect: false })
        .suspendedAutoReconnect
    ).toBe(true)
  })

  it('allows auto-reconnect after manual connect', () => {
    expect(
      allowAutoReconnectAfterManualConnect({ suspendedAutoReconnect: true }).suspendedAutoReconnect
    ).toBe(false)
  })
})
