import { describe, expect, it } from 'vitest'
import { buildDeviceAdbArgs } from './adb.service'

describe('ADB device-specific args', () => {
  it('adds -s address before device-specific commands', () => {
    expect(buildDeviceAdbArgs('10.0.0.2:5555', ['shell', 'dumpsys', 'battery'])).toEqual([
      '-s',
      '10.0.0.2:5555',
      'shell',
      'dumpsys',
      'battery'
    ])
  })
})
