import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shell } from 'electron'
import { stat } from 'node:fs/promises'
import { createDefaultConfig } from '@shared/config/default-config'
import type { AppConfig } from '@shared/contracts/config.contracts'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { TeamGamesService } from '@main/modules/team-games/team-games.service'

vi.mock('electron', () => ({ app: {}, shell: { openPath: vi.fn() } }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
const game = {
  id: 'arena',
  name: 'Arena',
  description: 'Server',
  shortcutPath: 'C:\\VR Games\\Arena & Team.lnk'
}
let config: AppConfig
let service: TeamGamesService
let configuration: ConfigurationService
beforeEach(() => {
  vi.resetAllMocks()
  config = createDefaultConfig()
  configuration = {
    load: async () => ({ config }),
    update: async (update: (config: AppConfig) => AppConfig) => {
      config = update(structuredClone(config))
      return { config }
    }
  } as unknown as ConfigurationService
  vi.mocked(stat).mockResolvedValue({ isFile: () => true, isDirectory: () => false } as never)
  vi.mocked(shell.openPath).mockResolvedValue('')
  service = new TeamGamesService(configuration, 'win32')
})
afterEach(() => vi.useRealTimers())

describe('Team game shortcuts', () => {
  it('adds, edits and removes a game without changing devices or profiles', async () => {
    const originalProfiles = structuredClone(config.streamProfiles)
    await service.save(game)
    await service.save({ ...game, name: 'Arena 2', shortcutPath: 'C:\\Games\\New.lnk' })
    expect(config.teamGames).toEqual([
      { ...game, name: 'Arena 2', shortcutPath: 'C:\\Games\\New.lnk' }
    ])
    expect(config.streamProfiles).toEqual(originalProfiles)
    expect(config.devices).toEqual([])
    await service.remove(game.id)
    expect(config.teamGames).toEqual([])
    expect(shell.openPath).not.toHaveBeenCalled()
  })

  it('launches the saved shortcut unchanged through the OS, including spaces and special characters', async () => {
    await service.save(game)
    expect(await service.launch(game.id)).toEqual({ ok: true })
    expect(shell.openPath).toHaveBeenCalledExactlyOnceWith(game.shortcutPath)
  })

  it.each([
    'C:\\Games\\start.bat',
    'C:\\Games\\start.cmd',
    'C:\\Games\\game.exe',
    'C:\\Games\\steam.url'
  ])('accepts the Windows launcher %s', async (shortcutPath) => {
    await service.save({ ...game, shortcutPath })
    expect(await service.launch(game.id)).toEqual({ ok: true })
  })

  it.each(['relative.lnk', 'https://example.com/start.lnk', 'C:\\Games\\notes.txt'])(
    'rejects an unsupported or relative target %s',
    async (shortcutPath) => {
      await expect(service.save({ ...game, shortcutPath })).rejects.toThrow()
      expect(config.teamGames).toEqual([])
    }
  )

  it('reports missing files without attempting a launch', async () => {
    await service.save(game)
    vi.mocked(stat).mockRejectedValueOnce(new Error('ENOENT'))
    expect(await service.launch(game.id)).toEqual({ ok: false, error: 'INVALID_SHORTCUT' })
    expect(shell.openPath).not.toHaveBeenCalled()
  })

  it('reports OS failures and allows a retry', async () => {
    await service.save(game)
    vi.mocked(shell.openPath).mockResolvedValueOnce('Access denied')
    expect(await service.launch(game.id)).toEqual({ ok: false, error: 'LAUNCH_FAILED' })
    expect(await service.launch(game.id)).toEqual({ ok: true })
  })

  it('prevents overlapping launches and editing/removal while the same game opens', async () => {
    await service.save(game)
    let finish!: (error: string) => void
    vi.mocked(shell.openPath).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const launching = service.launch(game.id)
    await vi.waitFor(() => expect(shell.openPath).toHaveBeenCalledOnce())
    expect(await service.launch(game.id)).toEqual({ ok: false, error: 'ALREADY_LAUNCHING' })
    await expect(service.save({ ...game, name: 'Changed' })).rejects.toThrow('in progress')
    await expect(service.remove(game.id)).rejects.toThrow('in progress')
    finish('')
    expect(await launching).toEqual({ ok: true })
  })

  it('debounces repeated successful launch requests without polling game processes', async () => {
    vi.useFakeTimers()
    await service.save(game)
    await service.launch(game.id)
    expect(await service.launch(game.id)).toEqual({ ok: false, error: 'ALREADY_LAUNCHING' })
    vi.advanceTimersByTime(3000)
    expect(await service.launch(game.id)).toEqual({ ok: true })
    expect(shell.openPath).toHaveBeenCalledTimes(2)
  })

  it('supports macOS application bundles without treating arbitrary folders as launchers', async () => {
    const mac = new TeamGamesService(configuration, 'darwin')
    vi.mocked(stat).mockResolvedValue({ isFile: () => false, isDirectory: () => true } as never)
    await mac.save({ ...game, shortcutPath: '/Applications/Arena.app' })
    expect(await mac.launch(game.id)).toEqual({ ok: true })
    await expect(mac.save({ ...game, shortcutPath: '/Applications' })).rejects.toThrow()
  })
})
