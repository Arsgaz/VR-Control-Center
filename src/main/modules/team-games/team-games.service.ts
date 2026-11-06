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
    private readonly platform = process.platform
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
      shortcutPath: value.shortcutPath.trim()
    }
    await this.validatePath(game.shortcutPath)
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
      try {
        await this.validatePath(game.shortcutPath)
      } catch {
        return { ok: false, error: 'INVALID_SHORTCUT' }
      }
      // Let the OS resolve shortcut arguments, working directory and launcher.
      // This does not imply that the franchise's server has finished starting.
      const error = await shell.openPath(game.shortcutPath)
      if (error) throw new Error(error)
      this.lastLaunchAt.set(id, Date.now())
      return { ok: true }
    } catch (error) {
      logger.errorWithCause('Team game launch failed', error, { id })
      return { ok: false, error: 'LAUNCH_FAILED' }
    } finally {
      this.launching.delete(id)
    }
  }
}
