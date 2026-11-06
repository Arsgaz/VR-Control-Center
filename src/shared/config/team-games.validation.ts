import type { TeamGameConfig } from '../contracts/team-games.contracts'

export const isSteamAppId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)

export const isTeamGameIcon = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}\.png$/.test(value)

export const isTeamGameConfig = (value: unknown): value is TeamGameConfig => {
  if (!value || typeof value !== 'object') return false
  const game = value as Record<string, unknown>
  return (
    typeof game.id === 'string' &&
    game.id.trim().length > 0 &&
    game.id.length <= 100 &&
    typeof game.name === 'string' &&
    game.name.trim().length > 0 &&
    game.name.length <= 100 &&
    typeof game.description === 'string' &&
    game.description.length <= 400 &&
    (game.customIcon === undefined ||
      game.customIcon === null ||
      isTeamGameIcon(game.customIcon)) &&
    (game.steamAppId === undefined || isSteamAppId(game.steamAppId)) &&
    (game.requiresSteamVr === undefined || typeof game.requiresSteamVr === 'boolean') &&
    typeof game.shortcutPath === 'string' &&
    (isSteamAppId(game.steamAppId) || game.shortcutPath.trim().length > 0) &&
    game.shortcutPath.length <= 4096 &&
    !game.shortcutPath.includes('\0')
  )
}
