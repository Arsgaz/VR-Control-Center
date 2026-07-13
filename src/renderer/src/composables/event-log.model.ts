export type UserEventLevel = 'info' | 'success' | 'warning' | 'error'

export interface UserEventEntry {
  id: number
  occurredAt: string
  level: UserEventLevel
  message: string
  description?: string
  deviceId?: string
}

export interface UserEventInput {
  level: UserEventLevel
  message: string
  description?: string
  deviceId?: string
}

export const appendUserEvent = (
  entries: UserEventEntry[],
  entry: UserEventEntry,
  limit: number
): UserEventEntry[] => {
  return [entry, ...entries].slice(0, limit)
}

export const clearUserEvents = (): UserEventEntry[] => {
  return []
}

export const createUserEventEntry = (
  input: UserEventInput,
  id: number,
  occurredAt = new Date().toISOString()
): UserEventEntry => {
  return {
    id,
    occurredAt,
    level: input.level,
    message: input.message,
    description: input.description,
    deviceId: input.deviceId
  }
}

export const toUserFacingError = (
  operation: 'environment' | 'devices' | 'connect' | 'disconnect' | 'startStream' | 'stopStream'
): UserEventInput => {
  const messages: Record<typeof operation, UserEventInput> = {
    environment: {
      level: 'error',
      message: 'Не удалось проверить окружение.',
      description: 'Проверьте, что ADB и scrcpy установлены и доступны из PATH.'
    },
    devices: {
      level: 'error',
      message: 'Не удалось обновить список устройств.',
      description: 'Проверьте ADB, USB/Wi-Fi подключение и повторите попытку.'
    },
    connect: {
      level: 'error',
      message: 'Не удалось подключить шлем.',
      description: 'Проверьте IP-адрес, питание устройства и подключение к сети.'
    },
    disconnect: {
      level: 'error',
      message: 'Не удалось отключить шлем.',
      description: 'Проверьте состояние ADB-подключения и повторите попытку.'
    },
    startStream: {
      level: 'error',
      message: 'Не удалось запустить трансляцию.',
      description: 'Проверьте scrcpy, ADB-подключение и параметры запуска.'
    },
    stopStream: {
      level: 'error',
      message: 'Не удалось остановить трансляцию.',
      description: 'Проверьте состояние процесса scrcpy.'
    }
  }

  return messages[operation]
}
