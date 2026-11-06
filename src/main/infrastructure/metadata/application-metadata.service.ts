import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ApplicationMetadata } from '@shared/contracts/applications.contracts'
import { isAndroidPackageName } from '@shared/tools/applications.parser'
import { logger } from '@main/infrastructure/logging/logger'

const EMPTY: ApplicationMetadata = { name: null, imageDataUrl: null }
const CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000
const RETRY_MS = 5 * 60 * 1000
const IMAGE_LIMIT = 2 * 1024 * 1024
const MEMORY_LIMIT = 16 * 1024 * 1024
const MEMORY_ENTRY_LIMIT = 256

interface CachedMetadata {
  metadata: ApplicationMetadata
  checkedAt: number
  retryAt: number
}

interface MemoryCacheOptions {
  maxBytes?: number
  maxEntries?: number
}

export const isArtworkUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'raw.githubusercontent.com' ||
        url.hostname.endsWith('.oculuscdn.com') ||
        url.hostname.endsWith('.fbcdn.net'))
    )
  } catch {
    return false
  }
}

const imageMime = (bytes: Buffer): string | null => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  return null
}

export class ApplicationMetadataService {
  private readonly pending = new Map<string, Promise<ApplicationMetadata>>()
  private readonly memory = new Map<string, { value: CachedMetadata; bytes: number }>()
  private memoryBytes = 0

  public constructor(
    private readonly directory: string,
    private readonly request: typeof fetch = fetch,
    private readonly memoryOptions: MemoryCacheOptions = {}
  ) {}

  private recall(packageName: string): CachedMetadata | undefined {
    const entry = this.memory.get(packageName)
    if (!entry) return undefined
    this.memory.delete(packageName)
    this.memory.set(packageName, entry)
    return entry.value
  }

  private remember(packageName: string, value: CachedMetadata): void {
    const previous = this.memory.get(packageName)
    if (previous) {
      this.memory.delete(packageName)
      this.memoryBytes -= previous.bytes
    }
    // Conservative UTF-16 string estimate plus per-entry overhead. This bounds
    // retained cache data, not the entire process heap or decoded renderer images.
    const bytes =
      512 +
      2 *
        (packageName.length +
          (value.metadata.name?.length ?? 0) +
          (value.metadata.imageDataUrl?.length ?? 0))
    const maxBytes = this.memoryOptions.maxBytes ?? MEMORY_LIMIT
    const maxEntries = this.memoryOptions.maxEntries ?? MEMORY_ENTRY_LIMIT
    if (bytes > maxBytes || maxEntries <= 0) return
    this.memory.set(packageName, { value, bytes })
    this.memoryBytes += bytes
    while (this.memoryBytes > maxBytes || this.memory.size > maxEntries) {
      const oldest = this.memory.keys().next().value!
      this.memoryBytes -= this.memory.get(oldest)!.bytes
      this.memory.delete(oldest)
    }
  }

  private async download(url: string, limit: number, redirects = 0): Promise<Buffer | null> {
    if (!isArtworkUrl(url) || redirects > 3) return null
    const response = await this.request(url, {
      signal: AbortSignal.timeout(5000),
      redirect: 'manual'
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      return location ? this.download(new URL(location, url).href, limit, redirects + 1) : null
    }
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length') ?? 0) > limit
    ) {
      await response.body?.cancel()
      return null
    }
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > limit) return null
        chunks.push(Buffer.from(value))
      }
      return Buffer.concat(chunks)
    } finally {
      await reader.cancel().catch(() => undefined)
    }
  }

  public async get(packageName: string, online = false): Promise<ApplicationMetadata> {
    if (!isAndroidPackageName(packageName)) throw new Error('Invalid package name')
    let cached = this.recall(packageName)
    if (!cached) {
      try {
        const file = await readFile(join(this.directory, `${packageName}.json`), 'utf8')
        if (file.length <= IMAGE_LIMIT * 2) {
          const value = JSON.parse(file)
          if (
            typeof value.checkedAt === 'number' &&
            (value.name === null || typeof value.name === 'string') &&
            (value.imageDataUrl === null ||
              (typeof value.imageDataUrl === 'string' &&
                /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.imageDataUrl)))
          ) {
            cached = {
              metadata: { name: value.name, imageDataUrl: value.imageDataUrl },
              checkedAt: value.checkedAt,
              retryAt: 0
            }
            this.remember(packageName, cached)
          }
        }
      } catch {
        /* A missing or invalid cache is a normal first-run state. */
      }
    }
    // Another request may have populated the cache while this one read from disk.
    cached = this.recall(packageName) ?? cached
    if (
      !online ||
      (cached &&
        (Date.now() < cached.retryAt ||
          Date.now() - cached.checkedAt <
            (cached.metadata.imageDataUrl ? CACHE_AGE_MS : 60 * 60 * 1000)))
    )
      return cached?.metadata ?? { ...EMPTY }
    const existing = this.pending.get(packageName)
    if (existing) return existing
    const pending = this.load(packageName, cached?.metadata ?? { ...EMPTY })
    this.pending.set(packageName, pending)
    try {
      return await pending
    } finally {
      this.pending.delete(packageName)
    }
  }

  private async load(
    packageName: string,
    fallback: ApplicationMetadata
  ): Promise<ApplicationMetadata> {
    // Variant packages use the original game's artwork, as in LightningLauncher.
    const lookup = packageName.replaceAll('.mrf.', '.')
    let name = fallback.name
    let imageDataUrl = fallback.imageDataUrl
    let metadata: Record<string, unknown> = {}
    let found = false
    try {
      const bytes = await this.download(
        `https://raw.githubusercontent.com/threethan/MetaMetadata/main/data/common/${lookup}.json`,
        64 * 1024
      )
      if (bytes) {
        const data: unknown = JSON.parse(bytes.toString('utf8'))
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          metadata = data as Record<string, unknown>
          if (typeof metadata.name === 'string' && metadata.name.trim()) {
            name = metadata.name.trim().slice(0, 200)
            found = true
          }
        }
      }
    } catch (error) {
      logger.debug('Application metadata unavailable', {
        packageName,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    const urls = [
      `https://raw.githubusercontent.com/threethan/QuestLauncherImages/main/banner/${lookup}.jpg`,
      ...['landscape', 'square', 'icon'].flatMap((key) =>
        typeof metadata[key] === 'string' ? [metadata[key] as string] : []
      )
    ]
    for (const url of urls) {
      try {
        const bytes = await this.download(url, IMAGE_LIMIT)
        const mime = bytes && imageMime(bytes)
        if (bytes && mime) {
          imageDataUrl = `data:${mime};base64,${bytes.toString('base64')}`
          found = true
          break
        }
      } catch {
        /* A source can be unavailable; try the next image. */
      }
    }

    const value = { name, imageDataUrl }
    const checkedAt = found ? Date.now() : 0
    this.remember(packageName, { metadata: value, checkedAt, retryAt: Date.now() + RETRY_MS })
    if (found) {
      const temporary = join(this.directory, `${packageName}.${randomUUID()}.tmp`)
      try {
        await mkdir(this.directory, { recursive: true })
        await writeFile(temporary, JSON.stringify({ ...value, checkedAt }), 'utf8')
        await rename(temporary, join(this.directory, `${packageName}.json`))
      } catch (error) {
        logger.warn('Application artwork cache could not be saved', {
          packageName,
          message: String(error)
        })
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined)
      }
    }
    return value
  }
}
