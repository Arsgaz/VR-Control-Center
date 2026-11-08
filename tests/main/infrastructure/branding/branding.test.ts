import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from 'electron'
import {
  initializeApplicationIdentity,
  applyApplicationBranding
} from '@main/infrastructure/branding/branding'

const mocks = vi.hoisted(() => ({
  name: 'vr-control-center',
  paths: {} as Record<string, string>,
  image: {},
  dock: { setIcon: vi.fn() }
}))
vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }))
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/project',
    getPath: (key: string) => mocks.paths[key] ?? `/existing/${mocks.name}/${key}`,
    setName: vi.fn((name: string) => {
      mocks.name = name
    }),
    setPath: vi.fn((key: string, value: string) => {
      mocks.paths[key] = value
    }),
    setAppUserModelId: vi.fn(),
    dock: mocks.dock
  },
  nativeImage: { createFromPath: vi.fn(() => mocks.image) }
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.name = 'vr-control-center'
  mocks.paths = {}
})
afterEach(() => vi.unstubAllGlobals())
describe('application identity', () => {
  it('changes the display name without losing existing user data or logs', () => {
    const data = app.getPath('userData')
    const logs = app.getPath('logs')
    initializeApplicationIdentity()
    expect(mocks.name).toBe('VR Control Center')
    expect(app.getPath('userData')).toBe(data)
    expect(app.getPath('logs')).toBe(logs)
    initializeApplicationIdentity()
    expect(app.getPath('userData')).toBe(data)
  })
  it('uses the packaged Windows app ID for taskbar grouping', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    initializeApplicationIdentity()
    expect(app.setAppUserModelId).toHaveBeenCalledWith('com.vrcontrolcenter.desktop')
  })
  it('uses the common application icon for macOS Dock', () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    applyApplicationBranding()
    expect(mocks.dock.setIcon).toHaveBeenCalledWith(mocks.image)
  })
})
