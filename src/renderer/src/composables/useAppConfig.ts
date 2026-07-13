import { computed, ref } from 'vue'
import { createDefaultConfig } from '../../../shared/config/default-config'
import { setI18nLanguage, translate } from '../i18n'
import type {
  AppConfig,
  AppLanguage,
  ConfigurationError,
  ConfigurationFileInfo,
  DeviceConfigUpdate,
  NewDeviceConfig,
  NewStreamProfileConfig,
  StreamProfileConfigUpdate,
  UserSettingsUpdate
} from '../../../shared/contracts/config.contracts'
import { useEventLog } from './useEventLog'

const config = ref<AppConfig | null>(null)
const file = ref<ConfigurationFileInfo | null>(null)
const error = ref<ConfigurationError | null>(null)
const isLoading = ref(false)
let didLoad = false

const defaultConfig = createDefaultConfig()

export const useAppConfig = () => {
  const { addEvent } = useEventLog()

  const activeDevice = computed(() => {
    const currentConfig = config.value ?? defaultConfig
    return (
      currentConfig.devices.find((device) => device.id === currentConfig.settings.activeDeviceId) ??
      currentConfig.devices[0] ??
      null
    )
  })

  const activeStreamProfile = computed(() => {
    const currentConfig = config.value ?? defaultConfig
    return (
      currentConfig.streamProfiles.find(
        (profile) => profile.id === currentConfig.settings.activeStreamProfileId
      ) ??
      currentConfig.streamProfiles[0] ??
      null
    )
  })

  const loadConfig = async (): Promise<void> => {
    if (didLoad && config.value) {
      return
    }

    isLoading.value = true
    try {
      const result = await window.vrControl.configuration.getConfig()
      if (result.ok) {
        config.value = result.state.config
        setI18nLanguage(result.state.config.settings.language)
        file.value = result.state.file
        error.value = null
        didLoad = true
        return
      }

      error.value = result.error
      addEvent({
        level: 'error',
        message: translate('dialogs.errors.configLoad'),
        description: result.error.message
      })
    } finally {
      isLoading.value = false
    }
  }

  const applyResult = (
    result: Awaited<ReturnType<typeof window.vrControl.configuration.getConfig>>,
    failureMessage: string
  ): boolean => {
    if (result.ok) {
      config.value = result.state.config
      setI18nLanguage(result.state.config.settings.language)
      file.value = result.state.file
      error.value = null
      return true
    }

    error.value = result.error
    addEvent({
      level: 'error',
      message: failureMessage,
      description: result.error.message
    })
    return false
  }

  const runConfigOperation = async (
    task: () => Promise<Awaited<ReturnType<typeof window.vrControl.configuration.getConfig>>>,
    failureMessage: string
  ): Promise<boolean> => {
    isLoading.value = true
    try {
      return applyResult(await task(), failureMessage)
    } finally {
      isLoading.value = false
    }
  }

  const addDevice = async (device: NewDeviceConfig): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.addDevice(device),
      translate('dialogs.errors.addDevice')
    )
  }

  const updateDevice = async (id: string, changes: DeviceConfigUpdate): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.updateDevice(id, changes),
      translate('dialogs.errors.updateDevice')
    )
  }

  const deleteDevice = async (id: string): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.deleteDevice(id),
      translate('dialogs.errors.deleteDevice')
    )
  }

  const updateLanguage = async (language: AppLanguage): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.updateLanguage(language),
      translate('dialogs.errors.languageUpdate')
    )
  }

  const updateSettings = async (changes: UserSettingsUpdate): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.updateSettings(changes),
      translate('dialogs.errors.settingsUpdate')
    )
  }

  const addStreamProfile = async (profile: NewStreamProfileConfig): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.addStreamProfile(profile),
      translate('dialogs.errors.addProfile')
    )
  }

  const updateStreamProfile = async (
    id: string,
    changes: StreamProfileConfigUpdate
  ): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.updateStreamProfile(id, changes),
      translate('dialogs.errors.updateProfile')
    )
  }

  const deleteStreamProfile = async (id: string): Promise<boolean> => {
    return runConfigOperation(
      () => window.vrControl.configuration.deleteStreamProfile(id),
      translate('dialogs.errors.deleteProfile')
    )
  }

  const resetConfig = async (): Promise<boolean> => {
    isLoading.value = true
    try {
      const result = await window.vrControl.configuration.resetConfig()
      if (result.ok) {
        config.value = result.state.config
        setI18nLanguage(result.state.config.settings.language)
        file.value = result.state.file
        error.value = null
        addEvent({
          level: 'success',
          message: translate('logger.events.configurationReset')
        })
        return true
      }

      error.value = result.error
      addEvent({
        level: 'error',
        message: translate('dialogs.errors.configReset'),
        description: result.error.message
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    config,
    file,
    error,
    isLoading,
    activeDevice,
    activeStreamProfile,
    loadConfig,
    addDevice,
    updateDevice,
    deleteDevice,
    updateLanguage,
    updateSettings,
    addStreamProfile,
    updateStreamProfile,
    deleteStreamProfile,
    resetConfig
  }
}
