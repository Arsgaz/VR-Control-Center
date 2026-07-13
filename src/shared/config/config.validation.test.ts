import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './default-config'
import {
  isAppConfig,
  isRuntimePollingIntervalSeconds,
  isStreamProfileCrop,
  isStreamProfileMaxFps,
  isStreamProfileMaxSize,
  isStreamProfileVideoBitRate,
  normalizeAppConfig
} from './config.validation'

describe('config validation', () => {
  it('accepts the default configuration', () => {
    expect(isAppConfig(createDefaultConfig())).toBe(true)
    expect(createDefaultConfig().settings.autoReconnect).toBe(true)
    expect(createDefaultConfig().settings.launchAtStartup).toBe(false)
    expect(createDefaultConfig().settings.runtimePollingIntervalSeconds).toBe(10)
  })

  it('rejects an invalid schema version', () => {
    expect(
      isAppConfig({
        ...createDefaultConfig(),
        version: 999
      })
    ).toBe(false)
  })

  it('strips unknown runtime-only fields during normalization', () => {
    const config = {
      ...createDefaultConfig(),
      devices: [
        {
          id: 'quest-1',
          name: 'Quest 1',
          address: '10.0.0.2:5555',
          streamProfileId: 'default'
        }
      ],
      settings: {
        ...createDefaultConfig().settings,
        activeDeviceId: 'quest-1'
      }
    }
    const normalized = normalizeAppConfig({
      ...config,
      devices: [
        {
          ...config.devices[0],
          adbConnectionState: 'connected'
        }
      ]
    })

    expect(normalized).toEqual(config)
  })

  it('rejects malformed device entries', () => {
    expect(
      isAppConfig({
        ...createDefaultConfig(),
        devices: [
        {
            id: 'quest-1',
            name: 'Quest 1'
          }
        ]
      })
    ).toBe(false)
  })

  it('removes the legacy default test headset during normalization', () => {
    const normalized = normalizeAppConfig({
      ...createDefaultConfig(),
      devices: [
        {
          id: 'test-headset',
          name: 'Test headset',
          address: '192.168.1.100:5555',
          streamProfileId: 'default'
        }
      ],
      settings: {
        ...createDefaultConfig().settings,
        activeDeviceId: 'test-headset'
      }
    })

    expect(normalized?.devices).toEqual([])
    expect(normalized?.settings.activeDeviceId).toBeNull()
  })

  it('normalizes legacy stream profiles with new fields', () => {
    const normalized = normalizeAppConfig({
      ...createDefaultConfig(),
      streamProfiles: [
        {
          id: 'legacy',
          name: 'Legacy',
          noAudio: true,
          crop: ''
        }
      ],
      settings: {
        ...createDefaultConfig().settings,
        activeStreamProfileId: 'legacy'
      }
    })

    expect(normalized?.streamProfiles[0]).toEqual({
      id: 'legacy',
      name: 'Legacy',
      description: '',
      noAudio: true,
      crop: '',
      maxSize: null,
      maxFps: null,
      videoBitRate: '',
      videoCodec: 'h264'
    })
  })

  it('validates crop format', () => {
    expect(isStreamProfileCrop('1600:900:2017:510')).toBe(true)
    expect(isStreamProfileCrop('')).toBe(true)
    expect(isStreamProfileCrop('1600:0:0:0')).toBe(false)
    expect(isStreamProfileCrop('1600:900:-1:0')).toBe(false)
  })

  it('validates optional max size and max fps', () => {
    expect(isStreamProfileMaxSize(null)).toBe(true)
    expect(isStreamProfileMaxSize(1280)).toBe(true)
    expect(isStreamProfileMaxSize(0)).toBe(false)
    expect(isStreamProfileMaxFps(null)).toBe(true)
    expect(isStreamProfileMaxFps(90)).toBe(true)
    expect(isStreamProfileMaxFps(1.5)).toBe(false)
  })

  it('validates video bitrate format', () => {
    expect(isStreamProfileVideoBitRate('6M')).toBe(true)
    expect(isStreamProfileVideoBitRate('12M')).toBe(true)
    expect(isStreamProfileVideoBitRate('')).toBe(true)
    expect(isStreamProfileVideoBitRate('fast')).toBe(false)
  })

  it('validates runtime polling interval boundaries', () => {
    expect(isRuntimePollingIntervalSeconds(5)).toBe(true)
    expect(isRuntimePollingIntervalSeconds(10)).toBe(true)
    expect(isRuntimePollingIntervalSeconds(30)).toBe(true)
    expect(isRuntimePollingIntervalSeconds(1)).toBe(false)
    expect(isRuntimePollingIntervalSeconds(31)).toBe(false)
  })
})
