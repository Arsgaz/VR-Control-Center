import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../../shared/config/default-config'
import { ConfigurationService } from './configuration.service'

let tempDirectory: string

const createService = (): ConfigurationService => {
  return new ConfigurationService(() => tempDirectory)
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(join(tmpdir(), 'vrcc-config-'))
})

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

describe('ConfigurationService', () => {
  it('creates a default config when the file is missing', async () => {
    const service = createService()
    const state = await service.load()

    expect(state.config).toEqual(createDefaultConfig())
    await expect(readFile(join(tempDirectory, 'config.json'), 'utf8')).resolves.toContain(
      '"version": 1'
    )
  })

  it('loads an existing config', async () => {
    const config = {
      ...createDefaultConfig(),
      devices: [
        {
          id: 'test-headset',
          name: 'Updated headset',
          address: '10.0.0.2:5555'
        }
      ]
    }
    await writeFile(join(tempDirectory, 'config.json'), JSON.stringify(config, null, 2), 'utf8')

    const state = await createService().load()

    expect(state.config.devices[0]?.address).toBe('10.0.0.2:5555')
  })

  it('saves updates through the service', async () => {
    const service = createService()
    await service.load()
    await service.update((config) => ({
      ...config,
      streamProfiles: config.streamProfiles.map((profile) => ({
        ...profile,
        crop: '1600:900:0:0'
      }))
    }))

    const rawConfig = await readFile(join(tempDirectory, 'config.json'), 'utf8')

    expect(rawConfig).toContain('"crop": "1600:900:0:0"')
  })

  it('backs up corrupted JSON and restores defaults', async () => {
    await writeFile(join(tempDirectory, 'config.json'), '{not valid json', 'utf8')

    const state = await createService().load()
    const files = await readdir(tempDirectory)

    expect(state.config).toEqual(createDefaultConfig())
    expect(files.some((file) => file.startsWith('config.json.corrupt-'))).toBe(true)
  })

  it('resets to defaults', async () => {
    const service = createService()
    await service.load()
    await service.update((config) => ({
      ...config,
      devices: [{ id: 'changed', name: 'Changed', address: '10.0.0.3:5555' }],
      settings: { ...config.settings, activeDeviceId: 'changed' }
    }))

    const state = await service.resetToDefault()

    expect(state.config).toEqual(createDefaultConfig())
  })
})
