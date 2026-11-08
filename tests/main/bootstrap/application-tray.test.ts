import { afterEach, describe, expect, it, vi } from 'vitest'
import { app, Menu, nativeImage, nativeTheme, Tray } from 'electron'
import { createDefaultConfig } from '@shared/config/default-config'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { createApplicationTray } from '@main/bootstrap/application-tray'

const mocks = vi.hoisted(() => ({
  theme: {
    shouldUseDarkColorsForSystemIntegratedUI: true,
    on: vi.fn(),
    off: vi.fn()
  },
  icon: { isEmpty: vi.fn(() => false), setTemplateImage: vi.fn() },
  tray: {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    setImage: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false)
  }
}))
vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => mocks.icon) },
  nativeTheme: mocks.theme,
  Menu: { buildFromTemplate: vi.fn((items) => items) },
  Tray: vi.fn(function () {
    return mocks.tray
  })
}))
vi.mock('@main/infrastructure/branding/branding', () => ({
  brandingPath: (file: string) => `/branding/${file}`
}))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  mocks.theme.shouldUseDarkColorsForSystemIntegratedUI = true
})

describe('OnePlace tray', () => {
  it('uses a logo, updates localized menus, opens the window and releases resources', () => {
    const config = createDefaultConfig('ru')
    const showWindow = vi.fn()
    const unsubscribe = vi.fn()
    let onChange!: () => void
    const configuration = {
      get: () => ({ config }),
      onDidChange: (listener: () => void) => {
        onChange = listener
        return unsubscribe
      }
    } as unknown as ConfigurationService
    const tray = createApplicationTray(configuration, showWindow)
    expect(Tray).toHaveBeenCalledOnce()
    expect(nativeImage.createFromPath).toHaveBeenCalledWith(
      expect.stringMatching(/tray(?:Template|-light)?\.png$/)
    )
    expect(mocks.tray.setToolTip).toHaveBeenCalledWith('OnePlace · VR Control Center')
    const menu = vi.mocked(Menu.buildFromTemplate).mock.calls[0][0]
    expect(menu[2].label).toBe('Открыть приложение')
    ;(menu[2].click as () => void)()
    expect(showWindow).toHaveBeenCalledOnce()
    ;(menu[3].click as () => void)()
    expect(app.quit).toHaveBeenCalledOnce()
    config.settings.language = 'en'
    onChange()
    expect(vi.mocked(Menu.buildFromTemplate).mock.calls[1][0][2].label).toBe('Open application')
    tray?.destroy()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.tray.destroy).toHaveBeenCalledOnce()
  })
  it('does not enable tray mode if its icon cannot be loaded', () => {
    mocks.icon.isEmpty.mockReturnValueOnce(true)
    expect(createApplicationTray({} as ConfigurationService, vi.fn())).toBeNull()
    expect(Tray).not.toHaveBeenCalled()
  })
  it('keeps the Windows headset visible when the taskbar theme changes and removes its listener', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const unsubscribe = vi.fn()
    const configuration = {
      get: () => ({ config: createDefaultConfig('ru') }),
      onDidChange: () => unsubscribe
    } as unknown as ConfigurationService
    const tray = createApplicationTray(configuration, vi.fn())
    expect(nativeImage.createFromPath).toHaveBeenLastCalledWith('/branding/tray.png')
    const listener = vi.mocked(nativeTheme.on).mock.calls[0][1]
    mocks.theme.shouldUseDarkColorsForSystemIntegratedUI = false
    listener()
    expect(nativeImage.createFromPath).toHaveBeenLastCalledWith('/branding/tray-light.png')
    expect(mocks.tray.setImage).toHaveBeenCalledWith(mocks.icon)
    tray?.destroy()
    expect(nativeTheme.off).toHaveBeenCalledWith('updated', listener)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
