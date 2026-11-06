import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { SteamLibraryService } from '@main/infrastructure/steam/steam-library.service'
it.skipIf(process.env.VRCC_LIVE_STEAM !== '1')(
  'checks real Steam VR categories and artwork, then reads the cache offline',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vrcc-live-steam-'))
    try {
      for (const id of ['546560', '275850', '730']) {
        await mkdir(join(root, 'steamapps/common', id), { recursive: true })
        await writeFile(
          join(root, `steamapps/appmanifest_${id}.acf`),
          `"AppState" { "appid" "${id}" "name" "Game ${id}" "installdir" "${id}" "StateFlags" "4" }`
        )
      }
      const directory = () => join(root, 'cache')
      const service = new SteamLibraryService(process.platform, fetch, directory)
      await service.setRoot(root)
      const result = await service.discoverVr()
      expect(result.unresolved).toBe(0)
      expect(result.games.map((game) => game.appId).sort()).toEqual(['275850', '546560'])
      for (const game of result.games)
        expect(await service.icon(game.appId)).toMatch(/^data:image\/(png|jpeg);base64,/)
      const offline = new SteamLibraryService(
        process.platform,
        async () => {
          throw new Error('Network disabled')
        },
        directory
      )
      await offline.setRoot(root)
      expect((await offline.discoverVr()).games.map((game) => game.appId).sort()).toEqual([
        '275850',
        '546560'
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  45000
)
