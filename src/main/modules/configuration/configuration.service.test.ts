import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultConfig } from '@shared/config/default-config'
import type { NewStreamProfileConfig } from '@shared/contracts/config.contracts'
import { ConfigurationService } from './configuration.service'

let tempDirectory: string

const createService = (): ConfigurationService => {
  return new ConfigurationService(() => tempDirectory, () => 'en-US', () => true)
}

const createServiceWithLocale = (locale: string): ConfigurationService => {
  return new ConfigurationService(() => tempDirectory, () => locale, () => true)
}

const createStreamProfile = (
  overrides: Partial<NewStreamProfileConfig> = {}
): NewStreamProfileConfig => ({
  id: 'wide',
  name: 'Wide crop',
  description: '',
  noAudio: true,
  crop: '1600:900:0:0',
  maxSize: 1280,
  maxFps: 30,
  videoBitRate: '6M',
  videoCodec: 'h264',
  ...overrides
})

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

  it('uses Russian on first launch when system locale starts with ru', async () => {
    const state = await createServiceWithLocale('ru-RU').load()

    expect(state.config.settings.language).toBe('ru')
  })

  it('uses English on first launch for non-Russian system locale', async () => {
    const state = await createServiceWithLocale('de-DE').load()

    expect(state.config.settings.language).toBe('en')
  })

  it('loads an existing config', async () => {
    const config = {
      ...createDefaultConfig(),
      devices: [
        {
          id: 'quest-1',
          name: 'Updated headset',
          address: '10.0.0.2:5555',
          streamProfileId: 'default'
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

  it('adds a device without changing stream profiles', async () => {
    const service = createService()
    const initialState = await service.load()
    const initialProfiles = initialState.config.streamProfiles

    const state = await service.addDevice({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'default'
    })

    expect(state.config.devices).toContainEqual({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'default'
    })
    expect(state.config.streamProfiles).toEqual(initialProfiles)
  })

  it('updates only the requested device', async () => {
    const service = createService()
    await service.load()
    await service.addDevice({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'default'
    })
    await service.addDevice({
      id: 'quest-3',
      name: 'Quest 3',
      address: '10.0.0.6:5555',
      streamProfileId: 'default'
    })

    const state = await service.updateDevice('quest-2', {
      address: '10.0.0.5:5555'
    })

    expect(state.config.devices.find((device) => device.id === 'quest-2')?.address).toBe(
      '10.0.0.5:5555'
    )
    expect(state.config.devices.find((device) => device.id === 'quest-3')?.address).toBe(
      '10.0.0.6:5555'
    )
  })

  it('deletes a device and preserves application settings', async () => {
    const service = createService()
    const initialState = await service.load()
    await service.addDevice({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'default'
    })

    const state = await service.deleteDevice('quest-2')

    expect(state.config.devices.some((device) => device.id === 'quest-2')).toBe(false)
    expect(state.config.application).toEqual(initialState.config.application)
    expect(state.config.logger).toEqual(initialState.config.logger)
  })

  it('returns an error when updating an unknown device id', async () => {
    const service = createService()
    await service.load()

    await expect(service.updateDevice('missing', { address: '10.0.0.6:5555' })).rejects.toThrow(
      'Unknown device id'
    )
  })

  it('rejects duplicate device addresses', async () => {
    const service = createService()
    await service.load()
    await service.addDevice({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'default'
    })

    await expect(
      service.addDevice({
        id: 'quest-3',
        name: 'Quest 3',
        address: '10.0.0.4:5555',
        streamProfileId: 'default'
      })
    ).rejects.toThrow('Device address already exists')
  })

  it('persists created devices for the next load', async () => {
    const service = createService()
    await service.load()
    await service.addDevice({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'default'
    })

    const reloaded = await createService().load()

    expect(reloaded.config.devices).toContainEqual({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'default'
    })
  })

  it('adds a stream profile without changing devices', async () => {
    const service = createService()
    const initialState = await service.load()
    const initialDevices = initialState.config.devices

    const profile = createStreamProfile()

    const state = await service.addStreamProfile(profile)

    expect(state.config.streamProfiles).toContainEqual(profile)
    expect(state.config.devices).toEqual(initialDevices)
  })

  it('updates only the requested stream profile', async () => {
    const service = createService()
    await service.load()
    await service.addStreamProfile(createStreamProfile())

    const state = await service.updateStreamProfile('wide', {
      noAudio: false
    })

    expect(state.config.streamProfiles.find((profile) => profile.id === 'wide')?.noAudio).toBe(
      false
    )
    expect(state.config.streamProfiles.find((profile) => profile.id === 'default')?.noAudio).toBe(
      true
    )
  })

  it('deletes a stream profile and preserves devices', async () => {
    const service = createService()
    const initialState = await service.load()
    await service.addStreamProfile(createStreamProfile())

    const state = await service.deleteStreamProfile('wide')

    expect(state.config.streamProfiles.some((profile) => profile.id === 'wide')).toBe(false)
    expect(state.config.devices).toEqual(initialState.config.devices)
  })

  it('rejects deleting a stream profile assigned to a device', async () => {
    const service = createService()
    await service.load()
    await service.addStreamProfile(createStreamProfile())
    await service.addDevice({
      id: 'quest-2',
      name: 'Quest 2',
      address: '10.0.0.4:5555',
      streamProfileId: 'wide'
    })

    await expect(service.deleteStreamProfile('wide')).rejects.toThrow('Stream profile is used')
  })

  it('rejects duplicate stream profile names case-insensitively', async () => {
    const service = createService()
    await service.load()
    await service.addStreamProfile(createStreamProfile())

    await expect(
      service.addStreamProfile(createStreamProfile({ id: 'wide-copy', name: 'wide crop' }))
    ).rejects.toThrow('Stream profile name already exists')
  })

  it('returns an error when deleting an unknown stream profile id', async () => {
    const service = createService()
    await service.load()

    await expect(service.deleteStreamProfile('missing')).rejects.toThrow('Unknown stream profile id')
  })

  it('backs up corrupted JSON and restores defaults', async () => {
    await writeFile(join(tempDirectory, 'config.json'), '{not valid json', 'utf8')

    const state = await createService().load()
    const files = await readdir(tempDirectory)

    expect(state.config).toEqual(createDefaultConfig())
    expect(files.some((file) => file.startsWith('config.json.corrupt-'))).toBe(true)
  })

  it('resets to defaults', async () => {
    const service = createServiceWithLocale('ru-RU')
    await service.load()
    await service.update((config) => ({
      ...config,
      devices: [
        {
          id: 'changed',
          name: 'Changed',
          address: '10.0.0.3:5555',
          streamProfileId: 'default'
        }
      ],
      settings: { ...config.settings, activeDeviceId: 'changed' }
    }))

    const state = await service.resetToDefault()

    expect(state.config).toEqual(createDefaultConfig('ru'))
    expect(state.config.settings.language).toBe('ru')
  })

  it('updates settings without touching runtime state', async () => {
    const service = createService()
    await service.load()

    const state = await service.updateSettings({
      autoReconnect: false,
      runtimePollingIntervalSeconds: 15,
      adbSource: 'custom',
      adbPath: '  /opt/android/adb  ',
      logLevel: 'debug',
      verboseLogging: true
    })

    expect(state.config.settings.autoReconnect).toBe(false)
    expect(state.config.settings.runtimePollingIntervalSeconds).toBe(15)
    expect(state.config.settings.adbSource).toBe('custom')
    expect(state.config.settings.adbPath).toBe('/opt/android/adb')
    expect(state.config.settings.logLevel).toBe('debug')
    expect(state.config.settings.verboseLogging).toBe(true)
    expect(JSON.stringify(state.config)).not.toContain('connectionState')
    expect(JSON.stringify(state.config)).not.toContain('streamState')
  })

  it('rejects invalid runtime polling interval updates', async () => {
    const service = createService()
    await service.load()

    await expect(service.updateSettings({ runtimePollingIntervalSeconds: 1 })).rejects.toThrow(
      'Settings update payload is invalid'
    )
  })
})
