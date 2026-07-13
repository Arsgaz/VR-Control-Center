import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './default-config'
import { isAppConfig, normalizeAppConfig } from './config.validation'

describe('config validation', () => {
  it('accepts the default configuration', () => {
    expect(isAppConfig(createDefaultConfig())).toBe(true)
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
    const config = createDefaultConfig()
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
            id: 'test-headset',
            name: 'Test headset'
          }
        ]
      })
    ).toBe(false)
  })
})
