import { app } from 'electron'
import { readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import log from 'electron-log/main'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

export interface TechnicalLogInfo {
  directory: string
  file: string
}

const redactContext = (context?: LogContext): LogContext | undefined => {
  if (!context) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(context).filter(([key]) => {
      const normalizedKey = key.toLowerCase()
      return (
        !normalizedKey.includes('token') &&
        !normalizedKey.includes('secret') &&
        !normalizedKey.includes('password')
      )
    })
  )
}

export const configureLogger = (): TechnicalLogInfo => {
  const directory = app.getPath('logs')
  const file = log.transports.file.getFile().path
  const level: LogLevel = app.isPackaged ? 'info' : 'debug'

  log.initialize()
  log.transports.file.level = level
  log.transports.file.maxSize = 1024 * 1024 * 5
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.level = app.isPackaged ? 'warn' : 'debug'
  log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'

  return {
    directory,
    file
  }
}

export const getTechnicalLogInfo = (): TechnicalLogInfo => {
  return {
    directory: app.getPath('logs'),
    file: log.transports.file.getFile().path
  }
}

export const applyLoggerSettings = (level: LogLevel, verboseLogging: boolean): void => {
  const effectiveLevel = verboseLogging && level !== 'debug' ? 'debug' : level
  log.transports.file.level = effectiveLevel
  log.transports.console.level = effectiveLevel === 'debug' ? 'debug' : level
}

export const clearOldTechnicalLogs = async (): Promise<number> => {
  const info = getTechnicalLogInfo()
  const activeFile = resolve(info.file)
  const entries = await readdir(info.directory, { withFileTypes: true })
  let deletedFiles = 0

  for (const entry of entries) {
    if (!entry.isFile()) continue

    const file = resolve(join(info.directory, entry.name))
    if (file === activeFile) continue
    if (!entry.name.endsWith('.log')) continue

    await rm(file, { force: true })
    deletedFiles += 1
  }

  return deletedFiles
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    log.debug(message, redactContext(context))
  },
  info(message: string, context?: LogContext): void {
    log.info(message, redactContext(context))
  },
  warn(message: string, context?: LogContext): void {
    log.warn(message, redactContext(context))
  },
  error(message: string, context?: LogContext): void {
    log.error(message, redactContext(context))
  },
  errorWithCause(message: string, error: unknown, context?: LogContext): void {
    if (error instanceof Error) {
      log.error(message, {
        ...redactContext(context),
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack
      })
      return
    }

    log.error(message, {
      ...redactContext(context),
      error
    })
  }
}
