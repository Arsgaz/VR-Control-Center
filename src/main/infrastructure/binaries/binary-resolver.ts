import type { UserSettingsConfig } from '@shared/contracts/config.contracts'
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface BinaryResolver {
  adb: () => string
  scrcpy: () => string
  scrcpyServer?: () => string | undefined
}

export const systemBinaryResolver: BinaryResolver = {
  adb: () => 'adb',
  scrcpy: () => 'scrcpy'
}

const resolveTool = (
  source: UserSettingsConfig['adbSource'],
  customPath: string,
  systemName: string,
  bundledDirectory: string | null
): string => {
  if (source === 'custom' && customPath.trim()) {
    return customPath.trim()
  }
  if (source === 'bundled' || (source === 'auto' && bundledDirectory)) {
    if (!bundledDirectory) throw new Error('Bundled tools are unavailable on this platform')
    return join(bundledDirectory, `${systemName}.exe`)
  }

  return systemName
}

export const getBundledToolsDirectory = (): string | null => {
  if (process.platform !== 'win32' || process.arch !== 'x64') return null
  const directory = join(
    app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
    'tools',
    'win32-x64',
    'scrcpy'
  )
  return app.isPackaged || existsSync(directory) ? directory : null
}

export const createBinaryResolverFromSettings = (
  settings: UserSettingsConfig,
  bundledDirectory: string | null = getBundledToolsDirectory()
): BinaryResolver => ({
  adb: () => resolveTool(settings.adbSource, settings.adbPath, 'adb', bundledDirectory),
  scrcpy: () => resolveTool(settings.scrcpySource, settings.scrcpyPath, 'scrcpy', bundledDirectory),
  scrcpyServer: () =>
    bundledDirectory && (settings.scrcpySource === 'bundled' || settings.scrcpySource === 'auto')
      ? join(bundledDirectory, 'scrcpy-server')
      : undefined
})
