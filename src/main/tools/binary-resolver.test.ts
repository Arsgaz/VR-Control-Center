import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../../shared/config/default-config'
import { createBinaryResolverFromSettings } from './binary-resolver'

describe('createBinaryResolverFromSettings', () => {
  it('uses system binaries by default', () => {
    const resolver = createBinaryResolverFromSettings(createDefaultConfig().settings)

    expect(resolver.adb()).toBe('adb')
    expect(resolver.scrcpy()).toBe('scrcpy')
  })

  it('uses custom tool paths when configured', () => {
    const resolver = createBinaryResolverFromSettings({
      ...createDefaultConfig().settings,
      adbSource: 'custom',
      adbPath: '/tools/adb',
      scrcpySource: 'custom',
      scrcpyPath: '/tools/scrcpy'
    })

    expect(resolver.adb()).toBe('/tools/adb')
    expect(resolver.scrcpy()).toBe('/tools/scrcpy')
  })
})
