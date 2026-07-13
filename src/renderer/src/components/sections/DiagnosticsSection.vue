<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  AppLanguage,
  CloseBehavior,
  ConfigLogLevel,
  ToolBinarySource,
  UserSettingsConfig,
  UserSettingsUpdate
} from '../../../../shared/contracts/config.contracts'
import type { ToolBinaryKind } from '../../../../shared/contracts/app.contracts'
import { useAppConfig } from '../../composables/useAppConfig'
import { useEventLog } from '../../composables/useEventLog'
import { useHeadsetController } from '../../composables/useHeadsetController'

const headset = useHeadsetController()
const appConfig = useAppConfig()
const { addEvent } = useEventLog()
const { t } = useI18n()

const settings = computed<UserSettingsConfig | null>(() => headset.config.value?.settings ?? null)

const updateSettings = async (changes: UserSettingsUpdate): Promise<void> => {
  await appConfig.updateSettings(changes)
}

const getEventValue = (event: Event): string | null => {
  const target = event.target
  return target && 'value' in target && typeof target.value === 'string' ? target.value : null
}

const getEventChecked = (event: Event): boolean | null => {
  const target = event.target
  return target && 'checked' in target && typeof target.checked === 'boolean' ? target.checked : null
}

const updateLanguage = (event: Event): void => {
  const value = getEventValue(event)
  if (value) void appConfig.updateLanguage(value as AppLanguage)
}

const updateBoolean = (key: 'autoReconnect' | 'launchAtStartup' | 'verboseLogging', event: Event): void => {
  const checked = getEventChecked(event)
  if (checked !== null) void updateSettings({ [key]: checked })
}

const updateCloseBehavior = (event: Event): void => {
  const value = getEventValue(event)
  if (value) void updateSettings({ closeBehavior: value as CloseBehavior })
}

const updatePollingInterval = (event: Event): void => {
  const value = getEventValue(event)
  if (value) void updateSettings({ runtimePollingIntervalSeconds: Number(value) })
}

const updateLogLevel = (event: Event): void => {
  const value = getEventValue(event)
  if (value) void updateSettings({ logLevel: value as ConfigLogLevel })
}

const updateToolSource = async (tool: ToolBinaryKind, event: Event): Promise<void> => {
  const value = getEventValue(event)
  if (!value) return
  const source = value as ToolBinarySource
  await updateSettings(tool === 'adb' ? { adbSource: source } : { scrcpySource: source })
  await headset.checkEnvironment()
}

const chooseToolPath = async (tool: ToolBinaryKind): Promise<void> => {
  const result = await window.vrControl.selectToolBinary(tool)
  if (result.canceled || !result.path) return

  await updateSettings(
    tool === 'adb'
      ? { adbSource: 'custom', adbPath: result.path }
      : { scrcpySource: 'custom', scrcpyPath: result.path }
  )
  await headset.checkEnvironment()
}

const openLogsDirectory = async (): Promise<void> => {
  await window.vrControl.openLogsDirectory()
}

const clearOldLogs = async (): Promise<void> => {
  if (!window.confirm(t('settings.logging.clearConfirm'))) return

  const result = await window.vrControl.clearOldLogs()
  addEvent({
    level: 'success',
    message: t('settings.logging.cleared', { count: result.deletedFiles })
  })
}

const resetConfiguration = async (): Promise<void> => {
  if (!window.confirm(t('settings.danger.resetConfirm'))) return

  await headset.resetConfig()
}

const toolVersion = (tool: ToolBinaryKind): string => {
  return headset.environment.value?.[tool].version ?? t('settings.tools.notChecked')
}

const toolAvailable = (tool: ToolBinaryKind): boolean | null => {
  return headset.environment.value?.[tool].available ?? null
}

const toolPath = (tool: ToolBinaryKind): string => {
  if (!settings.value) return t('common.states.unknown')
  const source = tool === 'adb' ? settings.value.adbSource : settings.value.scrcpySource
  const path = tool === 'adb' ? settings.value.adbPath : settings.value.scrcpyPath
  if (source === 'custom') return path || t('settings.states.unavailable')
  if (source === 'bundled') return t('settings.states.notImplemented')
  return tool
}
</script>

<template>
  <section class="section-content" aria-labelledby="settings-title">
    <div class="section-heading">
      <p class="section-label">{{ t('settings.page.label') }}</p>
      <h2 id="settings-title">{{ t('settings.page.title') }}</h2>
      <p class="muted-text">{{ t('settings.page.description') }}</p>
    </div>

    <section class="settings-section-card info-card">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('settings.sections.general') }}</p>
          <h3>{{ t('settings.sections.general') }}</h3>
        </div>
      </div>

      <div class="settings-list">
        <label class="settings-row">
          <span>
            <strong>{{ t('settings.language.title') }}</strong>
          </span>
          <select
            :value="settings?.language ?? 'en'"
            :disabled="headset.isConfigLoading.value"
            @change="updateLanguage"
          >
            <option value="ru">{{ t('settings.language.russian') }}</option>
            <option value="en">{{ t('settings.language.english') }}</option>
          </select>
        </label>

        <label class="settings-row">
          <span>
            <strong>{{ t('settings.fields.autoReconnect') }} (`autoReconnect`)</strong>
            <small>{{ t('settings.descriptions.autoReconnect') }}</small>
          </span>
          <input
            type="checkbox"
            :checked="settings?.autoReconnect ?? true"
            @change="updateBoolean('autoReconnect', $event)"
          />
        </label>

        <label class="settings-row disabled-setting">
          <span>
            <strong>{{ t('settings.fields.launchAtStartup') }} (`launchAtStartup`)</strong>
            <small>{{ t('settings.descriptions.launchAtStartup') }}</small>
            <small>{{ t('settings.descriptions.launchAtStartupUnavailable') }}</small>
          </span>
          <input
            type="checkbox"
            :checked="settings?.launchAtStartup ?? false"
            disabled
            @change="updateBoolean('launchAtStartup', $event)"
          />
        </label>

        <label class="settings-row">
          <span>
            <strong>{{ t('settings.fields.closeBehavior') }} (`closeBehavior`)</strong>
            <small>{{ t('settings.descriptions.closeBehavior') }}</small>
          </span>
          <select :value="settings?.closeBehavior ?? 'quit'" @change="updateCloseBehavior">
            <option value="quit">{{ t('settings.options.quit') }}</option>
            <option value="ask">{{ t('settings.options.ask') }}</option>
            <option value="minimizeToTray" disabled>
              {{ t('settings.options.minimizeToTray') }} - {{ t('settings.descriptions.trayUnavailable') }}
            </option>
          </select>
        </label>

        <label class="settings-row">
          <span>
            <strong>
              {{ t('settings.fields.runtimePollingInterval') }} (`runtimePollingIntervalSeconds`)
            </strong>
            <small>{{ t('settings.descriptions.runtimePollingInterval') }}</small>
          </span>
          <select
            :value="settings?.runtimePollingIntervalSeconds ?? 10"
            @change="updatePollingInterval"
          >
            <option value="5">{{ t('settings.options.seconds', { count: 5 }) }}</option>
            <option value="10">{{ t('settings.options.seconds', { count: 10 }) }}</option>
            <option value="15">{{ t('settings.options.seconds', { count: 15 }) }}</option>
            <option value="30">{{ t('settings.options.seconds', { count: 30 }) }}</option>
          </select>
        </label>
      </div>
    </section>

    <section class="settings-section-card info-card">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('settings.sections.tools') }}</p>
          <h3>ADB / scrcpy</h3>
        </div>
        <button type="button" class="refresh-button" :disabled="headset.isBusy.value" @click="headset.checkEnvironment">
          {{
            headset.operation.value === 'environment'
              ? t('settings.tools.checking')
              : t('settings.tools.checkEnvironment')
          }}
        </button>
      </div>

      <div class="tool-settings-grid">
        <article v-for="tool in (['adb', 'scrcpy'] as const)" :key="tool" class="tool-settings-card">
          <div class="card-header">
            <div>
              <p class="section-label">{{ tool }}</p>
              <h3>{{ tool }}</h3>
            </div>
            <span
              class="status-pill"
              :class="toolAvailable(tool) === true ? 'ok' : toolAvailable(tool) === false ? 'bad' : ''"
            >
              {{
                toolAvailable(tool) === true
                  ? t('settings.tools.available')
                  : toolAvailable(tool) === false
                    ? t('settings.tools.unavailable')
                    : t('settings.tools.notChecked')
              }}
            </span>
          </div>

          <dl class="compact-details">
            <div>
              <dt>{{ t('settings.tools.version') }}</dt>
              <dd>{{ toolVersion(tool) }}</dd>
            </div>
            <div>
              <dt>{{ t('settings.tools.binaryPath') }}</dt>
              <dd>{{ toolPath(tool) }}</dd>
            </div>
          </dl>

          <label class="settings-row compact-row">
            <span>
              <strong>
                {{ tool === 'adb' ? t('settings.fields.adbSource') : t('settings.fields.scrcpySource') }}
              </strong>
              <small>{{ t('settings.descriptions.bundledUnavailable') }}</small>
            </span>
            <select
              :value="tool === 'adb' ? settings?.adbSource ?? 'system' : settings?.scrcpySource ?? 'system'"
              @change="updateToolSource(tool, $event)"
            >
              <option value="system">{{ t('settings.options.system') }}</option>
              <option value="custom">{{ t('settings.options.custom') }}</option>
              <option value="bundled" disabled>{{ t('settings.options.bundled') }}</option>
            </select>
          </label>

          <div class="settings-row compact-row">
            <span>
              <strong>
                {{ tool === 'adb' ? t('settings.fields.adbPath') : t('settings.fields.scrcpyPath') }}
              </strong>
              <small>{{ t('settings.descriptions.customPath') }}</small>
            </span>
            <button type="button" class="secondary-button" @click="chooseToolPath(tool)">
              {{ t('settings.tools.choose') }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="settings-section-card info-card">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('settings.sections.logging') }}</p>
          <h3>{{ t('settings.sections.logging') }}</h3>
        </div>
      </div>

      <div class="settings-list">
        <label class="settings-row">
          <span>
            <strong>{{ t('settings.fields.logLevel') }} (`logLevel`)</strong>
          </span>
          <select :value="settings?.logLevel ?? 'info'" @change="updateLogLevel">
            <option value="error">{{ t('settings.options.error') }}</option>
            <option value="warn">{{ t('settings.options.warn') }}</option>
            <option value="info">{{ t('settings.options.info') }}</option>
            <option value="debug">{{ t('settings.options.debug') }}</option>
          </select>
        </label>

        <label class="settings-row">
          <span>
            <strong>{{ t('settings.fields.verboseLogging') }} (`verboseLogging`)</strong>
            <small>{{ t('settings.descriptions.verboseLogging') }}</small>
          </span>
          <input
            type="checkbox"
            :checked="settings?.verboseLogging ?? false"
            @change="updateBoolean('verboseLogging', $event)"
          />
        </label>

        <dl class="compact-details">
          <div>
            <dt>{{ t('settings.logging.directory') }}</dt>
            <dd>{{ headset.technicalLogInfo.value?.directory ?? t('common.states.unknown') }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.logging.file') }}</dt>
            <dd>{{ headset.technicalLogInfo.value?.file ?? t('common.states.unknown') }}</dd>
          </div>
        </dl>

        <div class="settings-actions-row">
          <button type="button" class="secondary-button" @click="openLogsDirectory">
            {{ t('settings.logging.openDirectory') }}
          </button>
          <button type="button" class="danger-button" @click="clearOldLogs">
            {{ t('settings.logging.clearOld') }}
          </button>
        </div>
      </div>
    </section>

    <section class="settings-section-card info-card">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('settings.sections.runtime') }}</p>
          <h3>{{ t('settings.sections.runtime') }}</h3>
        </div>
      </div>

      <dl class="compact-details runtime-details">
        <div>
          <dt>{{ t('settings.runtime.version') }}</dt>
          <dd>{{ headset.appInfo.value?.appVersion ?? t('common.states.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.runtime.platform') }}</dt>
          <dd>{{ headset.appInfo.value?.platform ?? t('common.states.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.runtime.architecture') }}</dt>
          <dd>{{ headset.appInfo.value?.arch ?? t('common.states.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.runtime.electron') }}</dt>
          <dd>{{ headset.appInfo.value?.electronVersion ?? t('common.states.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.runtime.node') }}</dt>
          <dd>{{ headset.appInfo.value?.nodeVersion ?? t('common.states.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.runtime.userData') }}</dt>
          <dd>{{ headset.configFile.value?.directory ?? t('common.states.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.runtime.logDirectory') }}</dt>
          <dd>{{ headset.technicalLogInfo.value?.directory ?? t('common.states.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('settings.runtime.configFile') }}</dt>
          <dd>{{ headset.configFile.value?.file ?? t('common.states.unknown') }}</dd>
        </div>
      </dl>
    </section>

    <section class="settings-section-card danger-zone-card info-card">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('settings.sections.danger') }}</p>
          <h3>{{ t('settings.danger.resetTitle') }}</h3>
          <p class="muted-text">{{ t('settings.danger.resetDescription') }}</p>
        </div>
        <button
          type="button"
          class="danger-button"
          :disabled="headset.isConfigLoading.value"
          @click="resetConfiguration"
        >
          {{ t('common.actions.reset') }}
        </button>
      </div>
    </section>
  </section>
</template>
