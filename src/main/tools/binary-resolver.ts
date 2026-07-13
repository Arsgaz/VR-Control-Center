import type { UserSettingsConfig } from '../../shared/contracts/config.contracts'

export interface BinaryResolver {
  adb: () => string
  scrcpy: () => string
}

export const systemBinaryResolver: BinaryResolver = {
  adb: () => 'adb',
  scrcpy: () => 'scrcpy'
}

const resolveTool = (
  source: UserSettingsConfig['adbSource'],
  customPath: string,
  systemName: string
): string => {
  if (source === 'custom' && customPath.trim()) {
    return customPath.trim()
  }

  return systemName
}

export const createBinaryResolverFromSettings = (settings: UserSettingsConfig): BinaryResolver => ({
  adb: () => resolveTool(settings.adbSource, settings.adbPath, 'adb'),
  scrcpy: () => resolveTool(settings.scrcpySource, settings.scrcpyPath, 'scrcpy')
})
