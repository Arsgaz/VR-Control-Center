import { describe, expect, it } from 'vitest'
import {
  appendUserEvent,
  clearUserEvents,
  createUserEventEntry,
  toUserFacingError
} from './event-log.model'

describe('event log model', () => {
  it('limits entries without mutating the original list', () => {
    const first = createUserEventEntry({ level: 'info', message: 'first' }, 1, '2026-01-01T00:00:00.000Z')
    const second = createUserEventEntry(
      { level: 'success', message: 'second' },
      2,
      '2026-01-01T00:00:01.000Z'
    )
    const entries = appendUserEvent([first], second, 1)

    expect(entries).toEqual([second])
    expect([first]).toEqual([first])
  })

  it('keeps the expected level model', () => {
    const entry = createUserEventEntry(
      {
        level: 'warning',
        message: 'Check device',
        description: 'Device is offline',
        deviceId: '192.168.1.10:5555'
      },
      7,
      '2026-01-01T00:00:00.000Z'
    )

    expect(entry.level).toBe('warning')
    expect(entry.deviceId).toBe('192.168.1.10:5555')
  })

  it('clears entries', () => {
    expect(clearUserEvents()).toEqual([])
  })

  it('maps technical failures to user-facing events', () => {
    expect(toUserFacingError('connect')).toEqual({
      level: 'error',
      message: 'Не удалось подключить шлем.',
      description: 'Проверьте IP-адрес, питание устройства и подключение к сети.'
    })
  })
})
