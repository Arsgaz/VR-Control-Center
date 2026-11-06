import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const execute = promisify(execFile)
let fixture: string | undefined
afterEach(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true })
})

describe('Windows tool download integrity', () => {
  it('rejects an archive with the wrong SHA-256 before extracting or packaging it', async () => {
    fixture = await mkdtemp(join(tmpdir(), 'vrcc-tools-integrity-'))
    await mkdir(join(fixture, 'scripts'))
    for (const file of ['prepare-windows-tools.mjs', 'windows-tools.lock.json']) {
      await cp(resolve('scripts', file), join(fixture, 'scripts', file))
    }
    const archive = join(fixture, 'untrusted.zip')
    await writeFile(archive, 'this is not the official scrcpy archive')
    await expect(
      execute(process.execPath, [
        join(fixture, 'scripts/prepare-windows-tools.mjs'),
        '--archive',
        archive
      ])
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('SHA-256 mismatch') })
    await expect(access(join(fixture, 'resources/tools/win32-x64'))).rejects.toThrow()
  })
})
