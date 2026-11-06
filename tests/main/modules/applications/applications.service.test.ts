import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '@shared/config/default-config'
import type { ConfigurationService } from '@main/modules/configuration/configuration.service'
import type { ApplicationMetadataService } from '@main/infrastructure/metadata/application-metadata.service'
import { listAdbDevices } from '@main/infrastructure/adb/adb.service'
import { runCommand } from '@main/infrastructure/process/process-runner'
import { ApplicationsService } from '@main/modules/applications/applications.service'

vi.mock('@main/infrastructure/adb/adb.service', () => ({
  listAdbDevices: vi.fn(),
  buildDeviceAdbArgs: (address: string, args: string[]) => ['-s', address, ...args]
}))
vi.mock('@main/infrastructure/process/process-runner', () => ({ runCommand: vi.fn() }))
const output = (stdout: string, exitCode = 0, stderr = '') => ({
  stdout,
  exitCode,
  stderr,
  signal: null
})
const config = createDefaultConfig()
const metadata = { get: vi.fn() }
let service: ApplicationsService

beforeEach(() => {
  vi.resetAllMocks()
  config.devices = [
    { id: 'a', name: 'Quest A', address: '10.0.0.1:5555', streamProfileId: null },
    { id: 'b', name: 'Quest B', address: '10.0.0.2:5555', streamProfileId: null }
  ]
  config.settings.adbSource = 'custom'
  config.settings.adbPath = '/tools/adb'
  vi.mocked(listAdbDevices).mockResolvedValue({
    devices: config.devices.map((d) => ({
      serial: d.address,
      state: 'device' as const,
      rawState: 'device'
    })),
    stdout: '',
    stderr: ''
  })
  vi.mocked(runCommand).mockImplementation(async (_file, args) => {
    if (args.includes('start')) return output('Status: ok\nActivity: com.example/.Main')
    return output(
      args.includes('android.intent.category.LAUNCHER')
        ? 'com.example/.Main\ncom.example/.Other'
        : 'com.tv/.TvActivity\ncom.example/.Main'
    )
  })
  metadata.get.mockResolvedValue({ name: null, imageDataUrl: null })
  service = new ApplicationsService(
    { load: async () => ({ config }) } as unknown as ConfigurationService,
    metadata as unknown as ApplicationMetadataService
  )
})

describe('headset application operations', () => {
  it('lists launcher categories without duplicate packages and uses cache without network requests', async () => {
    const apps = await service.list('a')
    expect(apps.map((app) => app.packageName)).toEqual(['com.example', 'com.tv'])
    expect(metadata.get).toHaveBeenCalledWith('com.example')
    expect(runCommand).toHaveBeenCalledWith(
      '/tools/adb',
      expect.arrayContaining(['-s', '10.0.0.1:5555', 'query-activities']),
      expect.anything()
    )
  })
  it('targets the selected headset and revalidates launchable packages before launch', async () => {
    await expect(service.launch('b', 'com.example')).resolves.toEqual({
      packageName: 'com.example'
    })
    expect(runCommand).toHaveBeenLastCalledWith(
      '/tools/adb',
      [
        '-s',
        '10.0.0.2:5555',
        'shell',
        'am',
        'start',
        '--user',
        'current',
        '-W',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        'android.intent.category.LAUNCHER',
        '-n',
        'com.example/.Main'
      ],
      { timeoutMs: 30000 }
    )
  })
  it('refuses unauthorized headsets before running shell commands', async () => {
    vi.mocked(listAdbDevices).mockResolvedValue({
      devices: [{ serial: '10.0.0.1:5555', state: 'unauthorized', rawState: 'unauthorized' }],
      stdout: '',
      stderr: ''
    })
    await expect(service.list('a')).rejects.toMatchObject({ code: 'DEVICE_NOT_CONNECTED' })
    expect(runCommand).not.toHaveBeenCalled()
  })
  it('never launches a missing application or accepts shell input', async () => {
    await expect(service.launch('a', 'com.missing')).rejects.toMatchObject({
      code: 'APP_NOT_FOUND'
    })
    await expect(service.launch('a', 'com.example;reboot')).rejects.toMatchObject({
      code: 'INVALID_REQUEST'
    })
    expect(vi.mocked(runCommand).mock.calls.some(([, args]) => args.includes('start'))).toBe(false)
  })
  it('reports Android launch failures even when adb exits successfully', async () => {
    vi.mocked(runCommand).mockImplementation(async (_file, args) =>
      output(args.includes('start') ? 'Error: Activity class does not exist.' : 'com.example/.Main')
    )
    await expect(service.launch('a', 'com.example')).rejects.toMatchObject({
      code: 'LAUNCH_FAILED'
    })
  })
  it('only downloads artwork for packages discovered on the selected device', async () => {
    await service.list('a')
    await expect(service.artwork('a', 'com.missing')).rejects.toMatchObject({
      code: 'APP_NOT_FOUND'
    })
    await expect(service.artwork('b', 'com.example')).rejects.toMatchObject({
      code: 'APP_NOT_FOUND'
    })
    await service.artwork('a', 'com.example')
    expect(metadata.get).toHaveBeenLastCalledWith('com.example', true)
  })
  it('reports command failure instead of presenting an empty library', async () => {
    vi.mocked(runCommand).mockResolvedValue(output('Error: command not supported', 0))
    await expect(service.list('a')).rejects.toMatchObject({ code: 'LIST_FAILED' })
  })
  it('does not launch on a replacement address if settings change during discovery', async () => {
    vi.mocked(runCommand).mockImplementation(async () => {
      config.devices[0].address = '10.0.0.9:5555'
      return output('com.example/.Main')
    })
    await expect(service.launch('a', 'com.example')).rejects.toMatchObject({
      code: 'DEVICE_NOT_CONNECTED'
    })
    expect(vi.mocked(runCommand).mock.calls.some(([, args]) => args.includes('start'))).toBe(false)
  })
})
