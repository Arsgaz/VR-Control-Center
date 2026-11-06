import { vi } from 'vitest'

// Unit tests run in Node without starting Electron or writing application logs.
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
vi.mock('@main/infrastructure/logging/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorWithCause: vi.fn()
  },
  applyLoggerSettings: vi.fn()
}))
