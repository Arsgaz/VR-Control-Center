import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app, BrowserWindow, dialog } from 'electron'
import { createDefaultConfig } from '@shared/config/default-config'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import type { HeadsetRuntimeManager } from '@main/modules/devices/device-runtime.manager'
import type { ScrcpyService } from '@main/infrastructure/scrcpy/scrcpy.service'
import { createApplicationTray } from '@main/bootstrap/application-tray'
import { registerApplicationLifecycle } from '@main/bootstrap/lifecycle'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: Object.assign(new EventEmitter(), { quit: vi.fn(), setAppUserModelId: vi.fn() }),
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    dialog: { showMessageBox: vi.fn() }
  }
})
vi.mock('@main/bootstrap/application-tray', () => ({ createApplicationTray: vi.fn() }))
vi.mock('@main/bootstrap/create-main-window', () => ({ createMainWindow: vi.fn() }))

const config = createDefaultConfig()
const shutdown = vi.fn()
const stopOnShutdown = vi.fn()
const destroyTray = vi.fn()
const setBackgroundMode = vi.fn()
let window: EventEmitter & {
  webContents: EventEmitter
  hide: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  isMinimized: ReturnType<typeof vi.fn>
  isVisible: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createApplicationTray).mockReturnValue({ destroy: destroyTray })
  config.settings.closeBehavior = 'ask'
  config.settings.language = 'ru'
  registerApplicationLifecycle({
    runtimeManager: { shutdown, setBackgroundMode } as unknown as HeadsetRuntimeManager,
    scrcpyService: { stopOnShutdown } as unknown as ScrcpyService,
    configurationService: { get: () => ({ config }) } as ConfigurationService
  })
  window = Object.assign(new EventEmitter(), {
    webContents: new EventEmitter(),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false)
  })
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([window as never])
  app.emit('browser-window-created', {}, window)
})

afterEach(() => {
  app.removeAllListeners()
})

describe('application close behavior', () => {
  it('switches runtime polling between hidden/minimized and visible windows', () => {
    expect(setBackgroundMode).toHaveBeenLastCalledWith(false)
    window.isVisible.mockReturnValue(false)
    window.emit('hide')
    expect(setBackgroundMode).toHaveBeenLastCalledWith(true)
    window.isVisible.mockReturnValue(true)
    window.isMinimized.mockReturnValue(true)
    window.emit('minimize')
    expect(setBackgroundMode).toHaveBeenLastCalledWith(true)
    window.isMinimized.mockReturnValue(false)
    window.emit('restore')
    expect(setBackgroundMode).toHaveBeenLastCalledWith(false)
  })

  it('keeps foreground polling if another application window is still visible', () => {
    const other = { isDestroyed: () => false, isVisible: () => true, isMinimized: () => false }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([window as never, other as never])
    window.isVisible.mockReturnValue(false)
    window.emit('hide')
    expect(setBackgroundMode).toHaveBeenLastCalledWith(false)
  })
  it('cancels closing without stopping streams', async () => {
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false })
    const event = { preventDefault: vi.fn() }
    window.emit('close', event)
    await vi.waitFor(() => expect(dialog.showMessageBox).toHaveBeenCalledOnce())
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    expect(stopOnShutdown).not.toHaveBeenCalled()
  })

  it('shows only one dialog and quits after confirmation', async () => {
    let finish!: (value: { response: number; checkboxChecked: boolean }) => void
    vi.mocked(dialog.showMessageBox).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    window.emit('close', { preventDefault: vi.fn() })
    window.emit('close', { preventDefault: vi.fn() })
    expect(dialog.showMessageBox).toHaveBeenCalledOnce()
    finish({ response: 1, checkboxChecked: false })
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce())
  })

  it('uses quit behavior and lets application shutdown close windows without another prompt', () => {
    config.settings.closeBehavior = 'quit'
    window.emit('close', { preventDefault: vi.fn() })
    expect(app.quit).toHaveBeenCalledOnce()
    expect(dialog.showMessageBox).not.toHaveBeenCalled()
    app.emit('before-quit')
    const event = { preventDefault: vi.fn() }
    window.emit('close', event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(shutdown).toHaveBeenCalledOnce()
    expect(stopOnShutdown).toHaveBeenCalledOnce()
  })
  it('hides the window in tray mode while keeping runtime and streams active', () => {
    config.settings.closeBehavior = 'minimizeToTray'
    const event = { preventDefault: vi.fn() }
    window.emit('close', event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    expect(shutdown).not.toHaveBeenCalled()
    expect(stopOnShutdown).not.toHaveBeenCalled()
    app.emit('activate')
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('destroys the tray when quitting', () => {
    app.emit('before-quit')
    expect(destroyTray).toHaveBeenCalledOnce()
  })
})
