import { translate } from '../i18n'

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
      message: translate('logger.events.adbNotFound'),
      description: translate('logger.events.adbInstallHint')
    },
    devices: {
      level: 'error',
      message: translate('dialogs.errors.updateDevice'),
      description: translate('logger.events.runEnvironmentFirst')
    },
    connect: {
      level: 'error',
      message: translate('logger.events.deviceConnectionFailed', { name: 'Device' }),
      description: translate('logger.events.connectBeforeStream')
    },
    disconnect: {
      level: 'error',
      message: translate('logger.events.deviceDisconnectFailed', { name: 'Device' }),
      description: translate('logger.events.runEnvironmentFirst')
    },
    startStream: {
      level: 'error',
      message: translate('logger.events.streamStartFailed', { name: 'Device' }),
      description: translate('logger.events.connectBeforeStream')
    },
    stopStream: {
      level: 'error',
      message: translate('logger.events.streamStopFailed', { name: 'Device' }),
      description: translate('logger.events.technicalLogsHint')
    }
  }

  return messages[operation]
}
