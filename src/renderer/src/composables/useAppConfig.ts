import { computed, ref } from 'vue'
import { createDefaultConfig } from '../../../shared/config/default-config'
import type {
  AppConfig,
  ConfigurationError,
  ConfigurationFileInfo
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
        file.value = result.state.file
        error.value = null
        didLoad = true
        return
      }

      error.value = result.error
      addEvent({
        level: 'error',
        message: 'Не удалось загрузить конфигурацию.',
        description: result.error.message
      })
    } finally {
      isLoading.value = false
    }
  }

  const saveConfig = async (nextConfig: AppConfig): Promise<boolean> => {
    isLoading.value = true
    try {
      const result = await window.vrControl.configuration.updateConfig(nextConfig)
      if (result.ok) {
        config.value = result.state.config
        file.value = result.state.file
        error.value = null
        return true
      }

      error.value = result.error
      addEvent({
        level: 'error',
        message: 'Не удалось сохранить конфигурацию.',
        description: result.error.message
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  const updateConfig = async (updater: (currentConfig: AppConfig) => AppConfig): Promise<boolean> => {
    const currentConfig = config.value ?? defaultConfig
    return saveConfig(updater(structuredClone(currentConfig)))
  }

  const resetConfig = async (): Promise<boolean> => {
    isLoading.value = true
    try {
      const result = await window.vrControl.configuration.resetConfig()
      if (result.ok) {
        config.value = result.state.config
        file.value = result.state.file
        error.value = null
        addEvent({
          level: 'success',
          message: 'Конфигурация сброшена к значениям по умолчанию.'
        })
        return true
      }

      error.value = result.error
      addEvent({
        level: 'error',
        message: 'Не удалось сбросить конфигурацию.',
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
    saveConfig,
    updateConfig,
    resetConfig
  }
}
