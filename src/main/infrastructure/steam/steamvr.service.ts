import { app } from 'electron'
import { join } from 'node:path'
import { runCommand } from '@main/infrastructure/process/process-runner'
import type { SteamLibraryService } from './steam-library.service'

export class SteamVrError extends Error {
  public constructor(public readonly code: 'STEAMVR_UNAVAILABLE' | 'STEAMVR_NOT_READY') {
    super(code)
  }
}
export class SteamVrService {
  private pending: Promise<void> | null = null
  public constructor(
    private readonly library: SteamLibraryService,
    private readonly platform = process.platform
  ) {}
  public ensureReady(): Promise<void> {
    if (this.pending) return this.pending
    const work = this.start().finally(() => {
      if (this.pending === work) this.pending = null
    })
    this.pending = work
    return work
  }
  private async start(): Promise<void> {
    if (this.platform !== 'win32') throw new SteamVrError('STEAMVR_UNAVAILABLE')
    const dll = await this.library.openVrDll()
    if (!dll) throw new SteamVrError('STEAMVR_UNAVAILABLE')
    const script = join(
      app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
      'steamvr/ensure-steamvr.ps1'
    )
    try {
      const result = await runCommand(
        join(
          process.env.SystemRoot ?? 'C:/Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe'
        ),
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          script,
          '-OpenVrDll',
          dll
        ],
        { timeoutMs: 60_000 }
      )
      if (result.exitCode !== 0 || !result.stdout.includes('VRCC_STEAMVR_READY'))
        throw new SteamVrError('STEAMVR_NOT_READY')
    } catch {
      throw new SteamVrError('STEAMVR_NOT_READY')
    }
  }
}
