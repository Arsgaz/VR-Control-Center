import type { ConfigurationResult } from './config.contracts'

export interface TeamGameConfig {
  id: string
  name: string
  description: string
  customIcon?: string | null
  steamAppId?: string
  requiresSteamVr?: boolean
  shortcutPath: string
}

export const TEAM_GAMES_IPC_CHANNELS = {
  select: 'team-games:select',
  syncSteam: 'team-games:sync-steam',
  selectIcon: 'team-games:select-icon',
  icon: 'team-games:icon',
  save: 'team-games:save',
  remove: 'team-games:remove',
  launch: 'team-games:launch'
} as const

export type TeamGameLaunchResult =
  | { ok: true }
  | {
      ok: false
      error:
        | 'NOT_FOUND'
        | 'INVALID_SHORTCUT'
        | 'ALREADY_LAUNCHING'
        | 'LAUNCH_FAILED'
        | 'STEAMVR_UNAVAILABLE'
        | 'STEAMVR_NOT_READY'
        | 'STEAM_GAME_UNAVAILABLE'
    }

export interface TeamGameIconRequest {
  steamAppId?: string
  shortcutPath: string
  customIcon?: string | null
}
export type TeamGameIconSelection =
  { canceled: true } | { canceled: false; icon: string; imageDataUrl: string }

export interface SteamSyncSummary {
  found: boolean
  added: number
  unresolved: number
  canceled?: boolean
}
export type SteamSyncResult = ConfigurationResult & { summary?: SteamSyncSummary }
export interface TeamGamesApi {
  syncSteam: (chooseDirectory?: boolean) => Promise<SteamSyncResult>
  selectIcon: () => Promise<TeamGameIconSelection>
  icon: (game: TeamGameIconRequest) => Promise<string | null>
  selectShortcut: () => Promise<{ canceled: boolean; path: string | null; name: string }>
  save: (game: TeamGameConfig) => Promise<ConfigurationResult>
  remove: (id: string) => Promise<ConfigurationResult>
  launch: (id: string) => Promise<TeamGameLaunchResult>
}
