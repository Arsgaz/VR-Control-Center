import { app, nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isTeamGameIcon } from '@shared/config/team-games.validation'

const MAX_PNG_BYTES = 2 * 1024 * 1024
const MAX_DIMENSION = 4096
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export const validateIconPng = (bytes: Buffer): void => {
  if (
    bytes.length < 33 ||
    bytes.length > MAX_PNG_BYTES ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Invalid PNG file')
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error('PNG dimensions exceed limit')
  }
}

export class TeamGameIconsService {
  public constructor(
    private readonly directory = () => join(app.getPath('userData'), 'team-game-icons')
  ) {}

  private async readPng(path: string): Promise<Buffer> {
    const file = await open(path, 'r')
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > MAX_PNG_BYTES) throw new Error('PNG exceeds size limit')
      const bytes = Buffer.alloc(MAX_PNG_BYTES + 1)
      let offset = 0
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
        if (!bytesRead) break
        offset += bytesRead
      }
      const result = bytes.subarray(0, offset)
      validateIconPng(result)
      return result
    } finally {
      await file.close()
    }
  }

  public async importPng(path: string): Promise<{ icon: string; imageDataUrl: string }> {
    const bytes = await this.readPng(path)
    let image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) throw new Error('PNG could not be decoded')
    const size = image.getSize()
    if (Math.max(size.width, size.height) > 512) {
      image = image.resize(size.width >= size.height ? { width: 512 } : { height: 512 })
    }
    const normalized = image.toPNG()
    validateIconPng(normalized)
    const icon = `${createHash('sha256').update(normalized).digest('hex')}.png`
    await mkdir(this.directory(), { recursive: true })
    await writeFile(join(this.directory(), icon), normalized)
    return { icon, imageDataUrl: `data:image/png;base64,${normalized.toString('base64')}` }
  }

  public async custom(icon: unknown): Promise<string | null> {
    if (!isTeamGameIcon(icon)) return null
    try {
      const bytes = await this.readPng(join(this.directory(), icon))
      return `data:image/png;base64,${bytes.toString('base64')}`
    } catch {
      return null
    }
  }

  public async shortcut(path: string): Promise<string | null> {
    try {
      const image = await app.getFileIcon(path, { size: 'large' })
      return image.isEmpty() ? null : image.toDataURL()
    } catch {
      return null
    }
  }
}
