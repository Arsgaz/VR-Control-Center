import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'
import {
  TeamGameIconsService,
  validateIconPng
} from '@main/modules/team-games/team-game-icons.service'
import { isTeamGameConfig } from '@shared/config/team-games.validation'
import { createDefaultConfig } from '@shared/config/default-config'
import { normalizeAppConfig } from '@shared/config/config.validation'

vi.mock('electron', () => ({
  app: { getFileIcon: vi.fn() },
  nativeImage: { createFromBuffer: vi.fn() }
}))
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
)
let directory: string
let service: TeamGameIconsService
beforeEach(async () => {
  vi.resetAllMocks()
  directory = await mkdtemp(join(tmpdir(), 'vrcc-icons-'))
  service = new TeamGameIconsService(() => join(directory, 'managed'))
  vi.mocked(nativeImage.createFromBuffer).mockReturnValue({
    isEmpty: () => false,
    getSize: () => ({ width: 1, height: 1 }),
    toPNG: () => png
  } as never)
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('Team game icons', () => {
  it('keeps an independent PNG copy and deduplicates identical imports', async () => {
    const source = join(directory, 'custom.png')
    await writeFile(source, png)
    const result = await service.importPng(source)
    expect(result.icon).toMatch(/^[a-f0-9]{64}\.png$/)
    expect((await service.importPng(source)).icon).toBe(result.icon)
    await rm(source)
    expect(await service.custom(result.icon)).toBe(result.imageDataUrl)
    expect(await readFile(join(directory, 'managed', result.icon))).toEqual(png)
  })
  it('rejects files renamed to PNG and extreme dimensions before decoding', async () => {
    const path = join(directory, 'fake.png')
    await writeFile(path, '<svg>not PNG</svg>')
    await expect(service.importPng(path)).rejects.toThrow('PNG')
    const huge = Buffer.from(png)
    huge.writeUInt32BE(100000, 16)
    expect(() => validateIconPng(huge)).toThrow('dimensions')
    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled()
  })
  it('rejects oversized files and decode failures', async () => {
    const source = join(directory, 'large.png')
    await writeFile(source, Buffer.alloc(2 * 1024 * 1024 + 1))
    await expect(service.importPng(source)).rejects.toThrow('size')
    await writeFile(source, png)
    vi.mocked(nativeImage.createFromBuffer).mockReturnValue({ isEmpty: () => true } as never)
    await expect(service.importPng(source)).rejects.toThrow('decoded')
  })
  it('does not accept a custom icon path outside the managed directory', async () => {
    expect(await service.custom('../private.png')).toBeNull()
    expect(await service.custom('C:\\private.png')).toBeNull()
    expect(await service.custom('a'.repeat(64) + '.png')).toBeNull()
  })
  it('uses native OS icon extraction and tolerates unavailable icons', async () => {
    vi.mocked(app.getFileIcon).mockResolvedValue({
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,icon'
    } as never)
    expect(await service.shortcut('C:\\Games\\Arena.lnk')).toBe('data:image/png;base64,icon')
    expect(app.getFileIcon).toHaveBeenCalledWith('C:\\Games\\Arena.lnk', { size: 'large' })
    vi.mocked(app.getFileIcon).mockRejectedValue(new Error('missing'))
    expect(await service.shortcut('missing.lnk')).toBeNull()
  })
  it('keeps legacy configs valid and persists a custom icon through normalization', () => {
    const game = { id: 'a', name: 'Arena', description: '', shortcutPath: 'C:\\game.lnk' }
    const config = createDefaultConfig()
    config.teamGames = [game]
    expect(normalizeAppConfig(config)?.teamGames).toEqual([game])
    const custom = { ...game, customIcon: 'a'.repeat(64) + '.png' }
    config.teamGames = [custom]
    expect(normalizeAppConfig(config)?.teamGames).toEqual([custom])
    expect(isTeamGameConfig({ ...game, customIcon: '../escape.png' })).toBe(false)
    const steamGame = { ...game, shortcutPath: '', steamAppId: '546560', requiresSteamVr: false }
    config.teamGames = [steamGame]
    config.settings.steamDirectory = 'C:\\Steam'
    expect(normalizeAppConfig(config)?.teamGames).toEqual([steamGame])
    expect(normalizeAppConfig(config)?.settings.steamDirectory).toBe('C:\\Steam')
    expect(isTeamGameConfig({ ...steamGame, steamAppId: '123/../456' })).toBe(false)
    expect(isTeamGameConfig({ ...steamGame, requiresSteamVr: 'yes' })).toBe(false)
    expect(isTeamGameConfig({ ...game, customIcon: null })).toBe(true)
  })
})
