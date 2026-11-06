import {
  CONFIG_SCHEMA_VERSION,
  type AppConfig,
  type AppLanguage
} from '../contracts/config.contracts'

export const resolveLanguageFromLocale = (locale: string): AppLanguage => {
  return locale.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export const createDefaultConfig = (
  language: AppLanguage = 'en',
  options: { verboseLogging?: boolean } = {}
): AppConfig => ({
  version: CONFIG_SCHEMA_VERSION,
  application: {
    displayName: 'VR Control Center'
  },
  devices: [],
  teamGames: [],
  streamProfiles: [
    {
      id: 'default',
      name: 'Balanced',
      description: '',
      noAudio: true,
      crop: '',
      maxSize: 1280,
      maxFps: 30,
      videoBitRate: '6M',
      videoCodec: 'h264'
    }
  ],
  settings: {
    activeDeviceId: null,
    activeStreamProfileId: 'default',
    language,
    autoReconnect: true,
    launchAtStartup: false,
    closeBehavior: 'quit',
    runtimePollingIntervalSeconds: 10,
    adbSource: 'auto',
    adbPath: '',
    scrcpySource: 'auto',
    scrcpyPath: '',
    logLevel: 'info',
    verboseLogging: options.verboseLogging ?? false
  },
  logger: {
    level: 'info',
    maxFileSizeBytes: 1024 * 1024 * 5
  }
})
