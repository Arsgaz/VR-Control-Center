import { describe, expect, it } from 'vitest'
import { parseAdbDevices } from './adb.parser'

describe('parseAdbDevices', () => {
  it('returns an empty list for no connected devices', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([])
  })

  it('parses a connected device', () => {
    expect(parseAdbDevices('List of devices attached\n192.168.1.10:5555\tdevice\n')).toEqual([
      {
        serial: '192.168.1.10:5555',
        state: 'device',
        rawState: 'device'
      }
    ])
  })

  it('parses offline and unauthorized states', () => {
    expect(
      parseAdbDevices(
        'List of devices attached\n192.168.1.10:5555\toffline\n192.168.1.11:5555\tunauthorized\n'
      )
    ).toEqual([
      {
        serial: '192.168.1.10:5555',
        state: 'offline',
        rawState: 'offline'
      },
      {
        serial: '192.168.1.11:5555',
        state: 'unauthorized',
        rawState: 'unauthorized'
      }
    ])
  })

  it('keeps an unknown raw state while exposing state as unknown', () => {
    expect(parseAdbDevices('List of devices attached\n192.168.1.12:5555\trecovery\n')).toEqual([
      {
        serial: '192.168.1.12:5555',
        state: 'unknown',
        rawState: 'recovery'
      }
    ])
  })

  it('parses adb devices -l output with metadata', () => {
    expect(
      parseAdbDevices(
        'List of devices attached\n10.0.0.2:5555 device product:vr model:Quest_3 transport_id:7\n10.0.0.3:5555 offline transport_id:8\n'
      )
    ).toEqual([
      {
        serial: '10.0.0.2:5555',
        state: 'device',
        rawState: 'device'
      },
      {
        serial: '10.0.0.3:5555',
        state: 'offline',
        rawState: 'offline'
      }
    ])
  })
})
