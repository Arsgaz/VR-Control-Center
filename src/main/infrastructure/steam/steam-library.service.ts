import { app } from 'electron'
import { isSteamAppId } from '@shared/config/team-games.validation'
export { isSteamAppId } from '@shared/config/team-games.validation'
import { homedir } from 'node:os'
import { join, isAbsolute, resolve } from 'node:path'
import { mkdir, open, readdir, stat, writeFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { runCommand } from '@main/infrastructure/process/process-runner'

export interface InstalledSteamGame {
  appId: string
  name: string
  directory: string
}
interface SteamMetadata {
  checkedAt: number
  vr: boolean
  imageDataUrl: string | null
}

// Steam's local manifests are Valve KeyValues text, not JSON. Never execute their contents.
export const parseKeyValues = (source: string): Record<string, unknown> => {
  const tokens =
    source.replace(/^\uFEFF/, '').match(/"(?:\\.|[^"\\])*"|\{|\}|\/\/[^\n]*|[^\s{}"]+/g) ?? []
  let position = 0
  const word = (token: string): string =>
    token.startsWith('"') ? token.slice(1, -1).replace(/\\([\\"])/g, '$1') : token
  const object = (depth: number, nested: boolean): Record<string, unknown> => {
    if (depth > 32) throw new Error('KeyValues nesting limit')
    const result: Record<string, unknown> = Object.create(null)
    while (position < tokens.length) {
      const key = tokens[position++]
      if (key.startsWith('//')) continue
      if (key === '}') {
        if (!nested) throw new Error('Unexpected brace')
        return result
      }
      if (key === '{') throw new Error('Missing key')
      while (tokens[position]?.startsWith('//')) position++
      const value = tokens[position++]
      if (!value || value === '}') throw new Error('Missing value')
      result[word(key)] = value === '{' ? object(depth + 1, true) : word(value)
    }
    if (nested) throw new Error('Unclosed KeyValues object')
    return result
  }
  return object(0, false)
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export const readLimitedFile = async (path: string, maximum = 2 * 1024 * 1024): Promise<Buffer> => {
  const file = await open(path, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > maximum) throw new Error('File exceeds limit')
    const bytes = Buffer.alloc(maximum + 1)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset > maximum) throw new Error('File exceeds limit')
    return bytes.subarray(0, offset)
  } finally {
    await file.close()
  }
}
const responseBytes = async (response: Response, limit: number): Promise<Buffer> => {
  if (!response.ok || !response.body) throw new Error('Steam request failed')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('Steam response too large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks)
}
export const isOfficialVrGame = (data: unknown): boolean => {
  const value = record(data)
  return (
    value.type === 'game' &&
    Array.isArray(value.categories) &&
    value.categories.some((category) => [31, 53, 54].includes(Number(record(category).id)))
  )
}

export class SteamLibraryService {
  private root: string | null = null
  public constructor(
    private readonly platform = process.platform,
    private readonly request: typeof fetch = fetch,
    private readonly cacheDirectory = () => join(app.getPath('userData'), 'steam-metadata'),
    private readonly clock = () => Date.now(),
    private readonly rootProvider = (): string | undefined => undefined
  ) {}

  public async setRoot(path: string): Promise<void> {
    if (!isAbsolute(path) || path.includes('\0')) throw new Error('Invalid Steam directory')
    if (!(await stat(join(path, 'steamapps'))).isDirectory())
      throw new Error('Steam directory not found')
    this.root = path
  }
  public async findRoot(): Promise<string | null> {
    if (this.root) return this.root
    const candidates: string[] = []
    const configured = this.rootProvider()
    if (configured) {
      try {
        await this.setRoot(configured)
        return configured
      } catch {
        /* A moved custom installation may fall back to registry/defaults. */
      }
    }
    if (this.platform === 'win32') {
      try {
        const result = await runCommand(
          'reg.exe',
          ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
          { timeoutMs: 5000 }
        )
        const path = /SteamPath\s+REG_SZ\s+([^\r\n]+)/i.exec(result.stdout)?.[1]?.trim()
        if (path) candidates.push(path)
      } catch {
        /* Fall back to the standard installation directory. */
      }
      for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles])
        if (base) candidates.push(join(base, 'Steam'))
    } else if (this.platform === 'darwin')
      candidates.push(join(homedir(), 'Library/Application Support/Steam'))
    else candidates.push(join(homedir(), '.steam/steam'), join(homedir(), '.local/share/Steam'))
    for (const path of candidates) {
      try {
        await this.setRoot(path)
        return path
      } catch {
        /* Try the next candidate. */
      }
    }
    return null
  }
  public async installed(): Promise<InstalledSteamGame[] | null> {
    const root = await this.findRoot()
    if (!root) return null
    const libraries = new Set([root])
    try {
      const parsed = parseKeyValues(
        (await readLimitedFile(join(root, 'steamapps/libraryfolders.vdf'))).toString('utf8')
      )
      for (const [key, value] of Object.entries(
        record(parsed.libraryfolders ?? parsed.LibraryFolders)
      )) {
        const path = typeof value === 'string' && /^\d+$/.test(key) ? value : record(value).path
        if (
          typeof path === 'string' &&
          isAbsolute(path) &&
          !path.includes('\0') &&
          libraries.size < 100
        )
          libraries.add(path)
      }
    } catch {
      /* The root library remains usable. */
    }
    const games = new Map<string, InstalledSteamGame>()
    for (const library of libraries) {
      let files: string[]
      try {
        files = await readdir(join(library, 'steamapps'))
      } catch {
        continue
      }
      for (const file of files
        .filter((name) => /^appmanifest_\d+\.acf$/.test(name))
        .slice(0, 2000)) {
        try {
          const data = record(
            parseKeyValues(
              (await readLimitedFile(join(library, 'steamapps', file), 256 * 1024)).toString('utf8')
            ).AppState
          )
          const appId = data.appid
          if (
            !isSteamAppId(appId) ||
            file !== `appmanifest_${appId}.acf` ||
            (Number(data.StateFlags) & 4) === 0 ||
            typeof data.installdir !== 'string'
          )
            continue
          const common = resolve(library, 'steamapps/common')
          const directory = resolve(common, data.installdir)
          if (!directory.startsWith(common + (this.platform === 'win32' ? '\\' : '/'))) continue
          if (!(await stat(directory)).isDirectory()) continue
          games.set(appId, {
            appId,
            name:
              (typeof data.name === 'string' ? data.name.trim().slice(0, 100) : '') ||
              `Steam ${appId}`,
            directory
          })
        } catch {
          /* A broken/incomplete installation must not hide other libraries. */
        }
      }
    }
    return [...games.values()]
  }
  private async cached(appId: string): Promise<SteamMetadata | null> {
    try {
      const value = JSON.parse(
        (await readLimitedFile(join(this.cacheDirectory(), `${appId}.json`))).toString('utf8')
      )
      if (
        typeof value.checkedAt === 'number' &&
        typeof value.vr === 'boolean' &&
        (value.imageDataUrl === null ||
          (typeof value.imageDataUrl === 'string' &&
            /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.imageDataUrl)))
      )
        return value
    } catch {
      /* No valid metadata yet. */
    }
    return null
  }
  public async icon(appId: string): Promise<string | null> {
    if (!isSteamAppId(appId)) return null
    return (await this.cached(appId))?.imageDataUrl ?? null
  }
  private async metadata(appId: string, online: boolean): Promise<SteamMetadata | null> {
    const cached = await this.cached(appId)
    if (cached && this.clock() - cached.checkedAt < 7 * 24 * 60 * 60 * 1000) return cached
    if (!online) return cached
    try {
      const response = await this.request(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,categories&l=english`,
        { signal: AbortSignal.timeout(5000), redirect: 'error' }
      )
      const body = JSON.parse((await responseBytes(response, 256 * 1024)).toString('utf8'))
      if (body[appId]?.success !== true) return cached
      const data = body[appId].data
      const vr = isOfficialVrGame(data)
      let imageDataUrl = cached?.imageDataUrl ?? null
      if (vr && typeof data.header_image === 'string') {
        try {
          const url = new URL(data.header_image)
          if (
            url.protocol === 'https:' &&
            url.hostname.endsWith('.steamstatic.com') &&
            !url.username &&
            !url.password &&
            !url.port
          ) {
            const image = await this.request(url.href, {
              signal: AbortSignal.timeout(5000),
              redirect: 'error'
            })
            const bytes = await responseBytes(image, 1024 * 1024)
            const mime = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
              ? 'jpeg'
              : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                ? 'png'
                : null
            if (mime) imageDataUrl = `data:image/${mime};base64,${bytes.toString('base64')}`
          }
        } catch {
          /* Missing artwork does not hide a verified VR game. */
        }
      }
      const value: SteamMetadata = { checkedAt: this.clock(), vr, imageDataUrl }
      try {
        await mkdir(this.cacheDirectory(), { recursive: true })
        const temporary = join(this.cacheDirectory(), `${appId}.${randomUUID()}.tmp`)
        try {
          await writeFile(temporary, JSON.stringify(value))
          await rename(temporary, join(this.cacheDirectory(), `${appId}.json`))
        } finally {
          await rm(temporary, { force: true }).catch(() => undefined)
        }
      } catch {
        /* Return verified data even if the cache is not writable. */
      }
      return value
    } catch {
      return cached
    }
  }
  public async discoverVr(): Promise<{
    found: boolean
    games: InstalledSteamGame[]
    unresolved: number
  }> {
    const installed = await this.installed()
    if (installed === null) return { found: false, games: [], unresolved: 0 }
    const pending = installed.filter((game) => game.appId !== '250820')
    const games: InstalledSteamGame[] = []
    let unresolved = 0
    const deadline = this.clock() + 30_000
    const worker = async () => {
      while (pending.length) {
        const game = pending.shift()!
        const metadata = await this.metadata(game.appId, this.clock() < deadline)
        if (!metadata) unresolved++
        else if (metadata.vr) games.push(game)
      }
    }
    await Promise.all([worker(), worker()])
    return { found: true, games, unresolved }
  }
  public async openVrDll(): Promise<string | null> {
    const steamVr = (await this.installed())?.find((game) => game.appId === '250820')
    if (!steamVr) return null
    const dll = join(steamVr.directory, 'bin/win64/openvr_api.dll')
    try {
      return (await stat(dll)).isFile() ? dll : null
    } catch {
      return null
    }
  }
}
