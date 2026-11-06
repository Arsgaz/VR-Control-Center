import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  SteamLibraryService,
  parseKeyValues,
  isOfficialVrGame
} from '@main/infrastructure/steam/steam-library.service'
let directory: string
let root: string
let library: SteamLibraryService
let request: ReturnType<typeof vi.fn<typeof fetch>>
const vrDetails = (appId: string, categories = [54]) =>
  new Response(
    JSON.stringify({
      [appId]: {
        success: true,
        data: { type: 'game', categories: categories.map((id) => ({ id })) }
      }
    })
  )
const manifest = async (base: string, appId: string, name = 'Game', folder = appId, flags = 4) => {
  await mkdir(join(base, 'steamapps/common', folder), { recursive: true })
  await writeFile(
    join(base, `steamapps/appmanifest_${appId}.acf`),
    `"AppState" { "appid" "${appId}" "name" "${name}" "installdir" "${folder}" "StateFlags" "${flags}" }`
  )
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vrcc-steam-'))
  root = join(directory, 'Steam')
  await mkdir(join(root, 'steamapps'), { recursive: true })
  request = vi.fn<typeof fetch>()
  library = new SteamLibraryService(process.platform, request, () => join(directory, 'cache'))
  await library.setRoot(root)
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
describe('Steam installed VR library', () => {
  it('parses nested KeyValues, escapes and comments without prototype mutation', () => {
    const parsed = parseKeyValues(
      '// comment\n"libraryfolders" { "0" { "path" "C:\\\\Steam" } "__proto__" "safe" }'
    )
    expect(parsed.libraryfolders).toMatchObject({ '0': { path: 'C:\\Steam' }, __proto__: 'safe' })
    expect(Object.getPrototypeOf(parsed)).toBeNull()
    expect(() => parseKeyValues('"a" { "b" "x"')).toThrow('Unclosed')
  })
  it('discovers multiple libraries and ignores partial, missing and corrupt installs', async () => {
    const second = join(directory, 'Games')
    await manifest(root, '546560', 'Half-Life Alyx')
    await manifest(second, '620980', 'Beat Saber')
    await manifest(second, '1234', 'Downloading', '1234', 2)
    await writeFile(
      join(root, 'steamapps/libraryfolders.vdf'),
      `"libraryfolders" { "0" { "path" "${root.replaceAll('\\', '\\\\')}" } "1" { "path" "${second.replaceAll('\\', '\\\\')}" } }`
    )
    await writeFile(join(root, 'steamapps/appmanifest_11.acf'), 'broken')
    const installed = await library.installed()
    expect(installed?.map((game) => game.appId).sort()).toEqual(['546560', '620980'])
  })
  it('imports official VR-only and VR-supported games, excludes desktop games and SteamVR', async () => {
    for (const id of ['546560', '275850', '730', '250820']) await manifest(root, id)
    request.mockImplementation(async (input) => {
      const appId = new URL(String(input)).searchParams.get('appids')!
      return vrDetails(appId, appId === '730' ? [1, 2] : appId === '275850' ? [53] : [54])
    })
    const result = await library.discoverVr()
    expect(result.games.map((game) => game.appId).sort()).toEqual(['275850', '546560'])
    expect(result.unresolved).toBe(0)
    expect(request).toHaveBeenCalledTimes(3)
    request.mockRejectedValue(new Error('Offline'))
    expect((await library.discoverVr()).games).toHaveLength(2)
    expect(request).toHaveBeenCalledTimes(3)
  })
  it('does not guess VR support when Steam metadata is unavailable', async () => {
    await manifest(root, '546560')
    request.mockRejectedValue(new Error('Offline'))
    expect(await library.discoverVr()).toMatchObject({ found: true, games: [], unresolved: 1 })
    expect(isOfficialVrGame({ type: 'tool', categories: [{ id: 54 }] })).toBe(false)
    expect(isOfficialVrGame({ type: 'game', categories: [{ id: 52 }] })).toBe(false)
  })
  it('limits metadata concurrency to two and refuses redirects/oversized responses', async () => {
    for (const id of ['1', '2', '3', '4']) await manifest(root, id)
    let active = 0
    let maximum = 0
    request.mockImplementation(async () => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return new Response('x'.repeat(256 * 1024 + 1))
    })
    expect((await library.discoverVr()).unresolved).toBe(4)
    expect(maximum).toBe(2)
    expect(request.mock.calls.every(([, options]) => options?.redirect === 'error')).toBe(true)
  })
  it('does not fetch arbitrary artwork URLs supplied by metadata', async () => {
    await manifest(root, '546560')
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          '546560': {
            success: true,
            data: {
              type: 'game',
              categories: [{ id: 54 }],
              header_image: 'http://127.0.0.1/private'
            }
          }
        })
      )
    )
    expect((await library.discoverVr()).games).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(await library.icon('546560')).toBeNull()
    expect(await library.icon('../secret')).toBeNull()
  })
  it('caches artwork as a data URL and locates the installed OpenVR DLL', async () => {
    await manifest(root, '546560')
    await manifest(root, '250820', 'SteamVR', 'SteamVR')
    await mkdir(join(root, 'steamapps/common/SteamVR/bin/win64'), { recursive: true })
    await writeFile(join(root, 'steamapps/common/SteamVR/bin/win64/openvr_api.dll'), 'fixture')
    request.mockImplementation(async (input) =>
      String(input).includes('api/appdetails')
        ? new Response(
            JSON.stringify({
              '546560': {
                success: true,
                data: {
                  type: 'game',
                  categories: [{ id: 54 }],
                  header_image: 'https://shared.akamai.steamstatic.com/image.jpg'
                }
              }
            })
          )
        : new Response(new Uint8Array([255, 216, 255, 0]))
    )
    await library.discoverVr()
    expect(await library.icon('546560')).toBe('data:image/jpeg;base64,/9j/AA==')
    expect(await library.openVrDll()).toBe(
      join(root, 'steamapps/common/SteamVR/bin/win64/openvr_api.dll')
    )
  })
  it('keeps verified stale metadata usable offline and bounds a cold scan budget', async () => {
    await manifest(root, '546560')
    let now = 100000
    const cachedLibrary = new SteamLibraryService(
      process.platform,
      request,
      () => join(directory, 'cache'),
      () => now
    )
    await cachedLibrary.setRoot(root)
    request.mockResolvedValue(vrDetails('546560'))
    expect((await cachedLibrary.discoverVr()).games).toHaveLength(1)
    now += 8 * 24 * 60 * 60 * 1000
    request.mockRejectedValue(new Error('offline'))
    expect((await cachedLibrary.discoverVr()).games).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('restores an explicitly configured Steam root', async () => {
    const restored = new SteamLibraryService(
      process.platform,
      request,
      undefined,
      undefined,
      () => root
    )
    expect(await restored.findRoot()).toBe(root)
  })
})
