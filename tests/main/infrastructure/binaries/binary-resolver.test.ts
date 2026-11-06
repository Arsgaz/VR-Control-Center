import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { createDefaultConfig } from '@shared/config/default-config'
import { createBinaryResolverFromSettings } from '@main/infrastructure/binaries/binary-resolver'

describe('createBinaryResolverFromSettings', () => {
  it('uses system binaries by default', () => {
    const resolver = createBinaryResolverFromSettings(createDefaultConfig().settings, null)

    expect(resolver.adb()).toBe('adb')
    expect(resolver.scrcpy()).toBe('scrcpy')
  })

  it('prefers the full bundled Windows distribution automatically', () => {
    const directory = join('tools', 'win32-x64', 'scrcpy')
    const resolver = createBinaryResolverFromSettings(createDefaultConfig().settings, directory)
    expect(resolver.adb()).toBe(join(directory, 'adb.exe'))
    expect(resolver.scrcpy()).toBe(join(directory, 'scrcpy.exe'))
    expect(resolver.scrcpyServer?.()).toBe(join(directory, 'scrcpy-server'))
  })

  it('preserves explicit PATH selection even when bundled tools exist', () => {
    const resolver = createBinaryResolverFromSettings(
      { ...createDefaultConfig().settings, adbSource: 'system', scrcpySource: 'system' },
      '/bundle'
    )
    expect(resolver.adb()).toBe('adb')
    expect(resolver.scrcpy()).toBe('scrcpy')
    expect(resolver.scrcpyServer?.()).toBeUndefined()
  })

  it('reports unavailable bundled tools instead of silently using a different binary', () => {
    const resolver = createBinaryResolverFromSettings(
      { ...createDefaultConfig().settings, adbSource: 'bundled' },
      null
    )
    expect(() => resolver.adb()).toThrow('unavailable')
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
