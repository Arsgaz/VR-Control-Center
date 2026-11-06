import { dialog, ipcMain } from 'electron'
import { basename, extname } from 'node:path'
import { TEAM_GAMES_IPC_CHANNELS } from '@shared/contracts/team-games.contracts'
import type { ConfigurationResult, ConfigurationState } from '@shared/contracts/config.contracts'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import { logger } from '@main/infrastructure/logging/logger'
import { shortcutExtensions, TeamGamesService } from './team-games.service'

export const registerTeamGamesHandlers = (configuration: ConfigurationService): void => {
  const service = new TeamGamesService(configuration)
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
