import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ApplicationMetadataService } from '@main/infrastructure/metadata/application-metadata.service'

// Explicit opt-in: normal tests never depend on public servers or network access.
describe.runIf(process.env.VRCC_LIVE_ARTWORK === '1')('real public artwork sources', () => {
  it('downloads real game covers and reads them back from disk offline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vrcc-live-artwork-'))
    const service = new ApplicationMetadataService(directory)
    for (const packageName of ['com.beatgames.beatsaber', 'com.AnotherAxiom.GorillaTag']) {
      const value = await service.get(packageName, true)
      expect(value.name, `Missing display name for ${packageName}`).toBeTruthy()
      expect(value.imageDataUrl, `Missing real artwork for ${packageName}`).toMatch(
        /^data:image\/(png|jpeg|webp);base64,/
      )
      const image = value.imageDataUrl!.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)!
      const file = join(directory, `${packageName}.${image[1]}`)
      await writeFile(file, Buffer.from(image[2], 'base64'))
      const offline = new ApplicationMetadataService(directory, async () => {
        throw new Error('Offline')
      })
      await expect(offline.get(packageName)).resolves.toEqual(value)
      console.log(`${value.name}: ${file}`)
    }
  }, 120000)
})
