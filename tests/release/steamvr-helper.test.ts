import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
it.skipIf(process.platform !== 'win32')(
  'compiles the packaged PowerShell/OpenVR helper without starting SteamVR',
  () => {
    expect(() =>
      execFileSync(
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
          resolve('resources/steamvr/ensure-steamvr.ps1'),
          '-OpenVrDll',
          'unused',
          '-ValidateOnly'
        ],
        { timeout: 30000, windowsHide: true }
      )
    ).not.toThrow()
  }
)
