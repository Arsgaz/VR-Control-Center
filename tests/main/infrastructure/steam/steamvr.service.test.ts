import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SteamVrService } from '@main/infrastructure/steam/steamvr.service'
import type { SteamLibraryService } from '@main/infrastructure/steam/steam-library.service'
import { runCommand } from '@main/infrastructure/process/process-runner'
vi.mock('@main/infrastructure/process/process-runner', () => ({ runCommand: vi.fn() }))
const dll = 'C:\\Games & VR\\SteamVR\\openvr_api.dll'
const library = { openVrDll: vi.fn() }
beforeEach(() => {
  vi.resetAllMocks()
  library.openVrDll.mockResolvedValue(dll)
  vi.mocked(runCommand).mockResolvedValue({
    exitCode: 0,
    signal: null,
    stdout: 'VRCC_STEAMVR_READY\n',
    stderr: ''
  })
})
describe('SteamVR preparation', () => {
  it('shares simultaneous readiness requests and passes paths as arguments', async () => {
    const service = new SteamVrService(library as unknown as SteamLibraryService, 'win32')
    await Promise.all([service.ensureReady(), service.ensureReady()])
    expect(runCommand).toHaveBeenCalledOnce()
    expect(vi.mocked(runCommand).mock.calls[0][1]).toEqual(
      expect.arrayContaining(['-File', '-OpenVrDll', dll])
    )
    expect(vi.mocked(runCommand).mock.calls[0][2]).toEqual({ timeoutMs: 60000 })
  })
  it('does not run a helper when SteamVR is missing or the platform is unsupported', async () => {
    library.openVrDll.mockResolvedValue(null)
    await expect(
      new SteamVrService(library as unknown as SteamLibraryService, 'win32').ensureReady()
    ).rejects.toMatchObject({ code: 'STEAMVR_UNAVAILABLE' })
    await expect(
      new SteamVrService(library as unknown as SteamLibraryService, 'darwin').ensureReady()
    ).rejects.toMatchObject({ code: 'STEAMVR_UNAVAILABLE' })
    expect(runCommand).not.toHaveBeenCalled()
  })
  it('requires the readiness marker, bounds failures and allows a retry', async () => {
    const service = new SteamVrService(library as unknown as SteamLibraryService, 'win32')
    vi.mocked(runCommand).mockResolvedValueOnce({
      exitCode: 0,
      signal: null,
      stdout: 'process started',
      stderr: ''
    })
    await expect(service.ensureReady()).rejects.toMatchObject({ code: 'STEAMVR_NOT_READY' })
    vi.mocked(runCommand).mockRejectedValueOnce(new Error('timeout'))
    await expect(service.ensureReady()).rejects.toMatchObject({ code: 'STEAMVR_NOT_READY' })
    await expect(service.ensureReady()).resolves.toBeUndefined()
  })
})
