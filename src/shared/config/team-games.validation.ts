import type { TeamGameConfig } from '../contracts/team-games.contracts'

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
    typeof game.shortcutPath === 'string' &&
    game.shortcutPath.trim().length > 0 &&
    game.shortcutPath.length <= 4096 &&
    !game.shortcutPath.includes('\0')
  )
}
