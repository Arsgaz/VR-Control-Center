import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shell } from 'electron'
import { stat } from 'node:fs/promises'
import { createDefaultConfig } from '@shared/config/default-config'
import type { AppConfig } from '@shared/contracts/config.contracts'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { SteamVrError } from '@main/infrastructure/steam/steamvr.service'
import type { SteamVrService } from '@main/infrastructure/steam/steamvr.service'
import type { SteamLibraryService } from '@main/infrastructure/steam/steam-library.service'
import type { TeamGameIconsService } from '@main/modules/team-games/team-game-icons.service'
import { TeamGamesService } from '@main/modules/team-games/team-games.service'

vi.mock('electron', () => ({ app: {}, shell: { openPath: vi.fn(), openExternal: vi.fn() } }))
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

describe('Team game artwork priority', () => {
  it('prefers custom PNG, resets to native shortcut icon, and preserves selection on edit', async () => {
    const icon = 'a'.repeat(64) + '.png'
    const icons = {
      custom: vi.fn(async (id: unknown) => (id === icon ? 'custom-data' : null)),
      shortcut: vi.fn(async () => 'shortcut-data')
    }
    const withIcons = new TeamGamesService(
      configuration,
      'win32',
      icons as unknown as TeamGameIconsService
    )
    await withIcons.save({ ...game, customIcon: icon })
    expect(config.teamGames[0].customIcon).toBe(icon)
    expect(await withIcons.icon({ ...game, customIcon: icon })).toBe('custom-data')
    expect(icons.shortcut).not.toHaveBeenCalled()
    expect(await withIcons.icon(game)).toBe('shortcut-data')
    await withIcons.save({ ...game, customIcon: null })
    expect(config.teamGames[0].customIcon).toBeUndefined()
  })
  it('falls back when a managed icon is missing without breaking launch', async () => {
    const icons = { custom: vi.fn(async () => null), shortcut: vi.fn(async () => 'shortcut-data') }
    const withIcons = new TeamGamesService(
      configuration,
      'win32',
      icons as unknown as TeamGameIconsService
    )
    expect(await withIcons.icon({ ...game, customIcon: 'a'.repeat(64) + '.png' })).toBe(
      'shortcut-data'
    )
    expect(await withIcons.icon({ shortcutPath: 'relative.lnk' })).toBeNull()
    await withIcons.save(game)
    expect(await withIcons.launch(game.id)).toEqual({ ok: true })
  })
})

describe('SteamVR game orchestration', () => {
  const steamGame = { appId: '546560', name: 'Half-Life Alyx', directory: 'C:\\Steam\\Alyx' }
  const dependencies = () => {
    const steam = {
      installed: vi.fn(async () => [steamGame]),
      discoverVr: vi.fn(async () => ({ found: true, games: [steamGame], unresolved: 0 }))
    }
    const vr = { ensureReady: vi.fn(async () => undefined) }
    const service = new TeamGamesService(
      configuration,
      'win32',
      undefined,
      steam as unknown as SteamLibraryService,
      vr as unknown as SteamVrService
    )
    return { steam, vr, service }
  }
  it('imports installed VR games once and preserves operator edits', async () => {
    const { service } = dependencies()
    const first = await service.syncSteam()
    expect(first.summary.added).toBe(1)
    expect(config.teamGames[0]).toMatchObject({
      steamAppId: '546560',
      requiresSteamVr: true,
      shortcutPath: ''
    })
    config.teamGames[0].name = 'My custom name'
    config.teamGames[0].requiresSteamVr = false
    config.teamGames[0].customIcon = 'a'.repeat(64) + '.png'
    expect((await service.syncSteam()).summary.added).toBe(0)
    expect(config.teamGames[0]).toMatchObject({
      name: 'My custom name',
      requiresSteamVr: false,
      customIcon: 'a'.repeat(64) + '.png'
    })
  })
  it('waits for SteamVR before opening a shortcut and holds the launch lock', async () => {
    const { service, vr } = dependencies()
    await service.save({ ...game, requiresSteamVr: true })
    let ready!: () => void
    vr.ensureReady.mockReturnValueOnce(
      new Promise((resolve) => {
        ready = () => resolve(undefined)
      })
    )
    const launching = service.launch(game.id)
    await vi.waitFor(() => expect(vr.ensureReady).toHaveBeenCalledOnce())
    expect(shell.openPath).not.toHaveBeenCalled()
    expect(await service.launch(game.id)).toEqual({ ok: false, error: 'ALREADY_LAUNCHING' })
    await expect(service.remove(game.id)).rejects.toThrow('in progress')
    ready()
    expect(await launching).toEqual({ ok: true })
    expect(shell.openPath).toHaveBeenCalledWith(game.shortcutPath)
  })
  it('does not open the game when SteamVR times out', async () => {
    const { service, vr } = dependencies()
    await service.save({ ...game, requiresSteamVr: true })
    vr.ensureReady.mockRejectedValueOnce(new SteamVrError('STEAMVR_NOT_READY'))
    expect(await service.launch(game.id)).toEqual({ ok: false, error: 'STEAMVR_NOT_READY' })
    expect(shell.openPath).not.toHaveBeenCalled()
    expect(await service.launch(game.id)).toEqual({ ok: true })
  })
  it('launches an installed Steam AppID through Steam after preparation', async () => {
    const { service, steam, vr } = dependencies()
    await service.syncSteam()
    expect(await service.launch('steam-546560')).toEqual({ ok: true })
    expect(vr.ensureReady).toHaveBeenCalledOnce()
    expect(shell.openExternal).toHaveBeenCalledWith('steam://run/546560')
    expect(shell.openPath).not.toHaveBeenCalled()
    steam.installed.mockResolvedValue([])
    // Use a fresh instance so the launch cooldown does not mask uninstall detection.
    const fresh = new TeamGamesService(
      configuration,
      'win32',
      undefined,
      steam as unknown as SteamLibraryService,
      vr as unknown as SteamVrService
    )
    expect(await fresh.launch('steam-546560')).toEqual({
      ok: false,
      error: 'STEAM_GAME_UNAVAILABLE'
    })
  })
  it('shares a simultaneous import and refuses overflow without replacing existing cards', async () => {
    const { service, steam } = dependencies()
    const result = await Promise.all([service.syncSteam(), service.syncSteam()])
    expect(steam.discoverVr).toHaveBeenCalledOnce()
    expect(result.map((item) => item.summary.added)).toEqual([1, 1])
    expect(config.teamGames).toHaveLength(1)
    config.teamGames = Array.from({ length: 100 }, (_, i) => ({ ...game, id: `manual-${i}` }))
    const before = structuredClone(config.teamGames)
    await expect(service.syncSteam()).rejects.toThrow('limit')
    expect(config.teamGames).toEqual(before)
  })
  it('keeps ordinary shortcuts independent of SteamVR', async () => {
    const { service, vr } = dependencies()
    await service.save(game)
    expect(await service.launch(game.id)).toEqual({ ok: true })
    expect(vr.ensureReady).not.toHaveBeenCalled()
  })
})
