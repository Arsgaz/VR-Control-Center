import { SteamLibraryService } from '@main/infrastructure/steam/steam-library.service'
import { TeamGameIconsService } from './team-game-icons.service'
import { dialog, ipcMain } from 'electron'
import { basename, extname } from 'node:path'
import { TEAM_GAMES_IPC_CHANNELS } from '@shared/contracts/team-games.contracts'
import type { ConfigurationResult, ConfigurationState } from '@shared/contracts/config.contracts'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { logger } from '@main/infrastructure/logging/logger'
import { shortcutExtensions, TeamGamesService } from './team-games.service'

export const registerTeamGamesHandlers = (configuration: ConfigurationService): void => {
  const icons = new TeamGameIconsService()
  const steam = new SteamLibraryService(
    process.platform,
    fetch,
    undefined,
    undefined,
    () => configuration.get().config.settings.steamDirectory
  )
  const service = new TeamGamesService(configuration, process.platform, icons, steam)
  ipcMain.handle(TEAM_GAMES_IPC_CHANNELS.icon, (_, request: unknown) => service.icon(request))
  ipcMain.handle(TEAM_GAMES_IPC_CHANNELS.selectIcon, async () => {
    const result = await dialog.showOpenDialog({
      title:
        configuration.get().config.settings.language === 'ru'
          ? 'Выберите PNG игры'
          : 'Choose game PNG',
      properties: ['openFile'],
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    const path = result.canceled ? null : result.filePaths[0]
    if (!path) return { canceled: true }
    return { canceled: false, ...(await icons.importPng(path)) }
  })
  const mutate = async (task: () => Promise<ConfigurationState>): Promise<ConfigurationResult> => {
    try {
      return { ok: true, state: await task() }
    } catch (error) {
      logger.errorWithCause('Team game configuration failed', error)
      return {
        ok: false,
        error: {
          code: 'CONFIG_INVALID',
          message: 'Game could not be saved. Check the shortcut path and try again.'
        }
      }
    }
  }
  ipcMain.handle(TEAM_GAMES_IPC_CHANNELS.syncSteam, async (_, chooseDirectory?: unknown) => {
    try {
      if (chooseDirectory === true) {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Steam'
        })
        if (result.canceled || !result.filePaths[0])
          return {
            ok: true,
            state: await configuration.load(),
            summary: { found: false, added: 0, unresolved: 0, canceled: true }
          }
        await steam.setRoot(result.filePaths[0])
        await configuration.updateSettings({ steamDirectory: result.filePaths[0] })
      }
      return { ok: true, ...(await service.syncSteam()) }
    } catch (error) {
      logger.errorWithCause('Steam synchronization failed', error)
      return {
        ok: false,
        error: { code: 'CONFIG_INVALID', message: 'Steam synchronization failed' }
      }
    }
  })
  ipcMain.handle(TEAM_GAMES_IPC_CHANNELS.save, (_, value: unknown) =>
    mutate(() => service.save(value))
  )
  ipcMain.handle(TEAM_GAMES_IPC_CHANNELS.remove, (_, id: unknown) =>
    mutate(() => service.remove(id))
  )
  ipcMain.handle(TEAM_GAMES_IPC_CHANNELS.launch, (_, id: unknown) => service.launch(id))
  ipcMain.handle(TEAM_GAMES_IPC_CHANNELS.select, async () => {
    const russian = configuration.get().config.settings.language === 'ru'
    const result = await dialog.showOpenDialog({
      title: russian ? 'Выберите ярлык игры или сервера' : 'Choose a game or server shortcut',
      properties: ['openFile'],
      filters: [
        {
          name: russian ? 'Игры и ярлыки' : 'Games and shortcuts',
          extensions: shortcutExtensions(process.platform)
        }
      ]
    })
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    return { canceled: !path, path, name: path ? basename(path, extname(path)) : '' }
  })
}
