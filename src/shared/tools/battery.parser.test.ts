import { describe, expect, it } from 'vitest'
import { parseBatteryDumpsys, parseBatteryStatus } from './battery.parser'

describe('parseBatteryDumpsys', () => {
  it('parses full battery output', () => {
    expect(
      parseBatteryDumpsys(`
        AC powered: false
        USB powered: true
        Wireless powered: false
        status: 2
        level: 82
        voltage: 4012
        temperature: 327
      `)
    ).toMatchObject({
      level: 82,
      status: 'charging',
      acPowered: false,
      usbPowered: true,
      wirelessPowered: false,
      isCharging: true,
      voltageMillivolts: 4012,
      temperatureCelsius: 32.7
    })
  })

  it('handles incomplete output', () => {
    expect(parseBatteryDumpsys('level: 45\n')).toMatchObject({
      level: 45,
      status: null,
      isCharging: null,
      voltageMillivolts: null,
      temperatureCelsius: null
    })
  })

  it('translates Android battery statuses', () => {
    expect(parseBatteryStatus(1)).toBe('unknown')
    expect(parseBatteryStatus(2)).toBe('charging')
    expect(parseBatteryStatus(3)).toBe('discharging')
    expect(parseBatteryStatus(4)).toBe('not-charging')
    expect(parseBatteryStatus(5)).toBe('full')
    expect(parseBatteryStatus(99)).toBeNull()
  })
})
