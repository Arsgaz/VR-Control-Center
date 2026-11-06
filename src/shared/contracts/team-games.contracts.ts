import type { ConfigurationResult } from './config.contracts'

export interface TeamGameConfig {
  id: string
  name: string
  description: string
  shortcutPath: string
}

export const TEAM_GAMES_IPC_CHANNELS = {
  select: 'team-games:select',
  save: 'team-games:save',
  remove: 'team-games:remove',
  launch: 'team-games:launch'
} as const

export type TeamGameLaunchResult =
  | { ok: true }
  | { ok: false; error: 'NOT_FOUND' | 'INVALID_SHORTCUT' | 'ALREADY_LAUNCHING' | 'LAUNCH_FAILED' }

export interface TeamGamesApi {
  selectShortcut: () => Promise<{ canceled: boolean; path: string | null; name: string }>
  save: (game: TeamGameConfig) => Promise<ConfigurationResult>
  remove: (id: string) => Promise<ConfigurationResult>
  launch: (id: string) => Promise<TeamGameLaunchResult>
}
