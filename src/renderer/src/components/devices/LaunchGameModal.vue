<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DeviceConfig } from '../../../../shared/contracts/config.contracts'
import type {
  ApplicationErrorCode,
  InstalledApplication
} from '../../../../shared/contracts/applications.contracts'
import AppModal from '../ui/AppModal.vue'
import { useEventLog } from '../../composables/useEventLog'

const props = defineProps<{ device: DeviceConfig; connected: boolean }>()
defineEmits<{ close: [] }>()
const { t } = useI18n()
const { addEvent } = useEventLog()
const applications = ref<InstalledApplication[]>([])
const query = ref('')
const loading = ref(false)
const loadingArtwork = ref(false)
const artworkDone = ref(0)
const artworkFinished = ref(false)
const launching = ref<string | null>(null)
const launchedName = ref<string | null>(null)
const error = ref<ApplicationErrorCode | null>(null)
const brokenImages = ref(new Set<string>())
let generation = 0
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return applications.value
    .filter((application) =>
      `${application.name} ${application.packageName}`.toLocaleLowerCase().includes(needle)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
})
const imageCount = computed(
  () => applications.value.filter((application) => application.imageDataUrl).length
)

const load = async (): Promise<void> => {
  if (launching.value || loadingArtwork.value) return
  const current = ++generation
  loading.value = true
  error.value = null
  launchedName.value = null
  artworkFinished.value = false
  try {
    const result = await window.vrControl.applications.list(props.device.id)
    if (current !== generation) return
    if (result.ok) {
      applications.value = result.value
      brokenImages.value = new Set()
    } else {
      applications.value = []
      error.value = result.error.code
    }
  } catch {
    if (current === generation) error.value = 'LIST_FAILED'
  } finally {
    if (current === generation) {
      loading.value = false
      // Show the cached list first, then enrich cards without blocking search or launch.
      if (!error.value && applications.value.length) void loadArtwork()
    }
  }
}

const loadArtwork = async (): Promise<void> => {
  if (loadingArtwork.value || loading.value || !applications.value.length) return
  const current = generation
  const deviceId = props.device.id
  loadingArtwork.value = true
  artworkDone.value = 0
  artworkFinished.value = false
  const remaining = [...applications.value]
  const worker = async (): Promise<void> => {
    while (current === generation) {
      const application = remaining.shift()
      if (!application) return
      try {
        const result = await window.vrControl.applications.artwork(
          deviceId,
          application.packageName
        )
        if (current !== generation) return
        if (result.ok) {
          applications.value = applications.value.map((item) =>
            item.packageName === application.packageName
              ? {
                  ...item,
                  name: result.value.name ?? item.name,
                  imageDataUrl: result.value.imageDataUrl ?? item.imageDataUrl
                }
              : item
          )
        }
      } catch {
        /* Keep the application launchable even if artwork is unavailable. */
      }
      if (current === generation) artworkDone.value++
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(4, remaining.length) }, worker))
  } finally {
    if (current === generation) {
      loadingArtwork.value = false
      artworkFinished.value = true
    }
  }
}

const launch = async (application: InstalledApplication): Promise<void> => {
  if (launching.value || !props.connected) return
  launching.value = application.packageName
  error.value = null
  launchedName.value = null
  const current = generation
  const device = props.device
  try {
    const result = await window.vrControl.applications.launch(device.id, application.packageName)
    if (current !== generation) return
    if (result.ok) {
      launchedName.value = application.name
      addEvent({
        level: 'success',
        deviceId: device.id,
        message: t('devices.library.launched', { name: application.name, device: device.name })
      })
    } else {
      error.value = result.error.code
      addEvent({
        level: 'error',
        deviceId: device.id,
        message: t(`devices.library.errors.${result.error.code}`)
      })
    }
  } catch {
    if (current === generation) error.value = 'LAUNCH_FAILED'
  } finally {
    if (current === generation) launching.value = null
  }
}
watch(
  () => [props.device.id, props.device.address],
  () => {
    generation++
    loadingArtwork.value = false
    launching.value = null
    applications.value = []
    void load()
  },
  { immediate: true }
)
onUnmounted(() => {
  generation++
})
</script>

<template>
  <AppModal
    labelledby="application-library-title"
    wide
    :busy="launching !== null"
    @close="$emit('close')"
  >
    <section class="modal-panel application-library">
      <div class="card-header">
        <div>
          <h3 id="application-library-title">{{ t('devices.library.title') }}</h3>
          <p class="field-hint">{{ device.name }} · {{ device.address }}</p>
        </div>
        <button
          type="button"
          class="icon-button"
          :disabled="launching !== null"
          :aria-label="t('common.actions.close')"
          @click="$emit('close')"
        >
          ×
        </button>
      </div>
      <div class="library-toolbar">
        <label class="profile-field library-search"
          ><span>{{ t('devices.library.search') }}</span
          ><input
            v-model="query"
            autofocus
            type="search"
            :placeholder="t('devices.library.searchHint')"
        /></label>
        <button
          type="button"
          class="secondary-button"
          :disabled="loading || loadingArtwork || launching !== null"
          @click="load"
        >
          {{ loading ? t('devices.actions.refreshing') : t('common.actions.refresh') }}
        </button>
      </div>
      <p v-if="loadingArtwork" class="field-hint" role="status">
        {{
          t('devices.library.artworkProgress', { count: artworkDone, total: applications.length })
        }}
      </p>
      <p v-if="artworkFinished" class="field-hint" role="status">
        {{ t('devices.library.artworkDone', { count: imageCount, total: applications.length }) }}
      </p>
      <p v-if="!connected" class="state-message error-message">
        {{ t('devices.library.errors.DEVICE_NOT_CONNECTED') }}
      </p>
      <p v-if="error" class="state-message error-message" role="alert">
        {{ t(`devices.library.errors.${error}`) }}
      </p>
      <p v-if="launchedName" class="library-success" role="status">
        ✓ {{ t('devices.library.launched', { name: launchedName, device: device.name }) }}
      </p>
      <div v-if="loading" class="library-loading" role="status">
        <span class="loading-ring" aria-hidden="true" />{{ t('devices.library.loading') }}
      </div>
      <div v-else-if="!applications.length && !error" class="library-empty">
        <h4>{{ t('devices.library.empty') }}</h4>
        <p class="muted-text">{{ t('devices.library.emptyHint') }}</p>
      </div>
      <p v-else-if="!filtered.length && applications.length" class="muted-text">
        {{ t('devices.library.noResults') }}
      </p>
      <ul v-else-if="!loading" class="application-grid" :aria-label="t('devices.library.title')">
        <li v-for="application in filtered" :key="application.packageName" class="application-tile">
          <div class="application-cover">
            <img
              v-if="application.imageDataUrl && !brokenImages.has(application.packageName)"
              :src="application.imageDataUrl"
              alt=""
              loading="lazy"
              @error="brokenImages.add(application.packageName)"
            /><span v-else class="application-placeholder" aria-hidden="true">{{
              application.name.split('.').at(-1)?.slice(0, 2).toUpperCase()
            }}</span>
          </div>
          <div class="application-info">
            <h4 :title="application.name">{{ application.name }}</h4>
            <p :title="application.packageName">{{ application.packageName }}</p>
            <button
              type="button"
              class="primary-button compact-button"
              :disabled="launching !== null || !connected"
              :aria-label="t('devices.library.launchNamed', { name: application.name })"
              @click="launch(application)"
            >
              {{
                launching === application.packageName
                  ? t('devices.library.launching')
                  : t('common.actions.start')
              }}
            </button>
          </div>
        </li>
      </ul>
      <p v-if="applications.length" class="field-hint library-count">
        {{ t('devices.library.count', { count: filtered.length, total: applications.length }) }}
      </p>
    </section>
  </AppModal>
</template>
