import { SteamLibraryService, isSteamAppId } from '@main/infrastructure/steam/steam-library.service'
import { SteamVrService, SteamVrError } from '@main/infrastructure/steam/steamvr.service'
import { TeamGameIconsService } from './team-game-icons.service'
import { isTeamGameConfig } from '@shared/config/team-games.validation'
import { shell } from 'electron'
import { stat } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import {
  type TeamGameConfig,
  type TeamGameLaunchResult
} from '@shared/contracts/team-games.contracts'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { logger } from '@main/infrastructure/logging/logger'

export const shortcutExtensions = (platform: NodeJS.Platform): string[] =>
  platform === 'win32'
    ? ['lnk', 'url', 'exe', 'bat', 'cmd']
    : platform === 'darwin'
      ? ['app', 'webloc', 'command']
      : ['desktop', 'sh']

export class TeamGamesService {
  private readonly launching = new Set<string>()
  private readonly lastLaunchAt = new Map<string, number>()

  public constructor(
    private readonly configuration: ConfigurationService,
    private readonly platform = process.platform,
    private readonly icons = new TeamGameIconsService(),
    private readonly steam = new SteamLibraryService(platform),
    private readonly steamVr = new SteamVrService(steam, platform)
  ) {}

  private async validatePath(shortcutPath: string): Promise<void> {
    const paths = this.platform === 'win32' ? win32 : posix
    if (
      !paths.isAbsolute(shortcutPath) ||
      shortcutPath.includes('\0') ||
      !shortcutExtensions(this.platform).includes(
        paths.extname(shortcutPath).slice(1).toLowerCase()
      )
    ) {
      throw new Error('Unsupported shortcut path')
    }
    const info = await stat(shortcutPath)
    if (
      !info.isFile() &&
      !(
        this.platform === 'darwin' &&
        shortcutPath.toLowerCase().endsWith('.app') &&
        info.isDirectory()
      )
    ) {
      throw new Error('Shortcut is not a file or an application')
    }
  }

  public async save(value: unknown) {
    if (!isTeamGameConfig(value)) throw new Error('Invalid game')
    const game: TeamGameConfig = {
      id: value.id,
      name: value.name.trim(),
      description: value.description.trim(),
      shortcutPath: value.shortcutPath.trim(),
      ...(value.customIcon ? { customIcon: value.customIcon } : {}),
      ...(value.steamAppId ? { steamAppId: value.steamAppId } : {}),
      ...(value.requiresSteamVr !== undefined ? { requiresSteamVr: value.requiresSteamVr } : {})
    }
    if (game.customIcon && !(await this.icons.custom(game.customIcon)))
      throw new Error('Custom icon is unavailable')
    if (game.steamAppId) {
      const installed = await this.steam.installed()
      if (!installed?.some((item) => item.appId === game.steamAppId))
        throw new Error('Steam game is not installed')
    } else await this.validatePath(game.shortcutPath)
    return this.configuration.update((config) => {
      if (this.launching.has(game.id)) throw new Error('Game launch is in progress')
      const existing = config.teamGames.some((item) => item.id === game.id)
      if (!existing && config.teamGames.length >= 100) throw new Error('Game limit reached')
      config.teamGames = existing
        ? config.teamGames.map((item) => (item.id === game.id ? game : item))
        : [...config.teamGames, game]
      return config
    })
  }

  public async icon(value: unknown): Promise<string | null> {
    if (!value || typeof value !== 'object') return null
    const request = value as Record<string, unknown>
    const custom = await this.icons.custom(request.customIcon)
    if (custom) return custom
    if (isSteamAppId(request.steamAppId)) return this.steam.icon(request.steamAppId)
    if (typeof request.shortcutPath !== 'string') return null
    try {
      await this.validatePath(request.shortcutPath)
      return await this.icons.shortcut(request.shortcutPath)
    } catch {
      return null
    }
  }

  private syncing: Promise<{
    state: Awaited<ReturnType<ConfigurationService['load']>>
    summary: { found: boolean; added: number; unresolved: number }
  }> | null = null

  public syncSteam() {
    if (this.syncing) return this.syncing
    const work = (async () => {
      const scan = await this.steam.discoverVr()
      let added = 0
      const current = await this.configuration.load()
      const missing = scan.games.some(
        (game) => !current.config.teamGames.some((existing) => existing.steamAppId === game.appId)
      )
      const state = missing
        ? await this.configuration.update((config) => {
            for (const game of scan.games) {
              if (config.teamGames.some((existing) => existing.steamAppId === game.appId)) continue
              if (config.teamGames.length >= 100) throw new Error('Game limit reached')
              const id = `steam-${game.appId}`
              if (config.teamGames.some((existing) => existing.id === id))
                throw new Error('Game id collision')
              config.teamGames.push({
                id,
                name: game.name,
                description: '',
                shortcutPath: '',
                steamAppId: game.appId,
                requiresSteamVr: true
              })
              added++
            }
            return config
          })
        : current
      return { state, summary: { found: scan.found, added, unresolved: scan.unresolved } }
    })().finally(() => {
      if (this.syncing === work) this.syncing = null
    })
    this.syncing = work
    return work
  }

  public remove(id: unknown) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid game id')
    return this.configuration.update((config) => {
      if (this.launching.has(id)) throw new Error('Game launch is in progress')
      if (!config.teamGames.some((game) => game.id === id)) throw new Error('Unknown game')
      config.teamGames = config.teamGames.filter((game) => game.id !== id)
      this.lastLaunchAt.delete(id)
      return config
    })
  }

  public async launch(id: unknown): Promise<TeamGameLaunchResult> {
    if (typeof id !== 'string' || !id.trim()) return { ok: false, error: 'NOT_FOUND' }
    if (this.launching.has(id) || Date.now() - (this.lastLaunchAt.get(id) ?? -Infinity) < 3000) {
      return { ok: false, error: 'ALREADY_LAUNCHING' }
    }
    this.launching.add(id)
    try {
      const { config } = await this.configuration.load()
      const game = config.teamGames.find((item) => item.id === id)
      if (!game) return { ok: false, error: 'NOT_FOUND' }
      if (game.steamAppId) {
        if (!(await this.steam.installed())?.some((item) => item.appId === game.steamAppId))
          return { ok: false, error: 'STEAM_GAME_UNAVAILABLE' }
      } else {
        try {
          await this.validatePath(game.shortcutPath)
        } catch {
          return { ok: false, error: 'INVALID_SHORTCUT' }
        }
      }
      if (game.requiresSteamVr) await this.steamVr.ensureReady()
      // Steam is given a validated numeric ID; never execute a manifest's command line.
      if (game.steamAppId) await shell.openExternal(`steam://run/${game.steamAppId}`)
      else {
        const error = await shell.openPath(game.shortcutPath)
        if (error) throw new Error(error)
      }
      this.lastLaunchAt.set(id, Date.now())
      return { ok: true }
    } catch (error) {
      logger.errorWithCause('Team game launch failed', error, { id })
      return { ok: false, error: error instanceof SteamVrError ? error.code : 'LAUNCH_FAILED' }
    } finally {
      this.launching.delete(id)
    }
  }
}
