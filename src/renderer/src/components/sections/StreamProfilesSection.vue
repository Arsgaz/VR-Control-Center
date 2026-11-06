<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModal from '../ui/AppModal.vue'
import { useI18n } from 'vue-i18n'
import type { StreamProfileConfig } from '../../../../shared/contracts/config.contracts'
import { useHeadsetController } from '../../composables/useHeadsetController'
import {
  buildProfilePreviewArgs,
  createDraftFromProfile,
  createDuplicateProfilePayload,
  createNewProfileDraft,
  createProfilePayloadFromDraft,
  type StreamProfileDraft,
  type StreamProfileValidationKey,
  validateStreamProfileDraft
} from '../profiles/stream-profile-editor.model'

const headset = useHeadsetController()
const { t } = useI18n()

const selectedProfileId = ref<string | null>(null)
const draft = ref<StreamProfileDraft>(createNewProfileDraft())
const isCreating = ref(false)
const submitAttempted = ref(false)
const pendingProfileId = ref<string | null>(null)

const profiles = computed(() => headset.streamProfiles.value)
const devices = computed(() => headset.configuredDevices.value)
const selectedProfile = computed(() => {
  if (isCreating.value) return null
  return profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null
})

const serializedInitialDraft = ref(JSON.stringify(draft.value))
const hasUnsavedChanges = computed(
  () => JSON.stringify(draft.value) !== serializedInitialDraft.value
)

const savedNotice = ref(false)
const qualityPresets = [
  { id: 'economy', maxSize: '1024', maxFps: '30', videoBitRate: '4M' },
  { id: 'balanced', maxSize: '1280', maxFps: '30', videoBitRate: '6M' },
  { id: 'quality', maxSize: '1920', maxFps: '60', videoBitRate: '12M' }
]
const applyPreset = (preset: (typeof qualityPresets)[number]): void => {
  draft.value = {
    ...draft.value,
    maxSize: preset.maxSize,
    maxFps: preset.maxFps,
    videoBitRate: preset.videoBitRate
  }
}
const matchesPreset = (preset: (typeof qualityPresets)[number]): boolean => {
  return (
    draft.value.maxSize === preset.maxSize &&
    draft.value.maxFps === preset.maxFps &&
    draft.value.videoBitRate === preset.videoBitRate
  )
}
defineExpose({
  confirmLeave: (): boolean =>
    !hasUnsavedChanges.value || window.confirm(t('profiles.unsaved.leave'))
})

const resetDraftTracking = (): void => {
  serializedInitialDraft.value = JSON.stringify(draft.value)
  submitAttempted.value = false
  savedNotice.value = false
}

const selectProfileImmediately = (profile: StreamProfileConfig | null): void => {
  selectedProfileId.value = profile?.id ?? null
  isCreating.value = false
  draft.value = profile ? createDraftFromProfile(profile) : createNewProfileDraft()
  resetDraftTracking()
}

watch(
  profiles,
  (nextProfiles) => {
    if (isCreating.value) return

    const selected = nextProfiles.find((profile) => profile.id === selectedProfileId.value)
    if (selected) {
      draft.value = createDraftFromProfile(selected)
      resetDraftTracking()
      return
    }

    selectProfileImmediately(nextProfiles[0] ?? null)
  },
  { immediate: true }
)

const validationKey = computed<StreamProfileValidationKey | null>(() => {
  return validateStreamProfileDraft(draft.value, profiles.value)
})

const validationMessage = computed(() => {
  return validationKey.value ? t(`profiles.validation.${validationKey.value}`) : null
})

const usedDeviceCount = computed(() => {
  if (!selectedProfile.value) return 0
  return devices.value.filter((device) => device.streamProfileId === selectedProfile.value?.id)
    .length
})

const previewArgs = computed(() => {
  return buildProfilePreviewArgs(draft.value, t('profiles.preview.devicePlaceholder'))
})

const showUnsavedDialog = computed(() => pendingProfileId.value !== null)

const requestProfileSelection = (profileId: string): void => {
  if (profileId === selectedProfileId.value && !isCreating.value) return
  if (hasUnsavedChanges.value) {
    pendingProfileId.value = profileId
    return
  }

  selectProfileImmediately(profiles.value.find((profile) => profile.id === profileId) ?? null)
}

const startCreate = (): void => {
  if (hasUnsavedChanges.value) {
    pendingProfileId.value = '__create__'
    return
  }

  isCreating.value = true
  selectedProfileId.value = null
  draft.value = createNewProfileDraft()
  resetDraftTracking()
}

const saveDraft = async (): Promise<boolean> => {
  if (headset.isConfigLoading.value) return false
  submitAttempted.value = true
  if (validationKey.value) {
    return false
  }

  const payload = createProfilePayloadFromDraft(draft.value)
  const saved = isCreating.value
    ? await headset.addStreamProfile(payload)
    : await headset.updateStreamProfile(payload.id, {
        name: payload.name,
        description: payload.description,
        crop: payload.crop,
        maxSize: payload.maxSize,
        maxFps: payload.maxFps,
        videoBitRate: payload.videoBitRate,
        videoCodec: payload.videoCodec,
        noAudio: payload.noAudio
      })

  if (!saved) {
    return false
  }

  selectedProfileId.value = payload.id
  isCreating.value = false
  draft.value = createDraftFromProfile(payload)
  resetDraftTracking()
  savedNotice.value = true
  return true
}

const duplicateProfile = async (): Promise<void> => {
  if (!selectedProfile.value) return

  const payload = createDuplicateProfilePayload(
    selectedProfile.value,
    t('profiles.duplicate.suffix'),
    profiles.value
  )
  const saved = await headset.addStreamProfile(payload)
  if (saved) {
    selectProfileImmediately(payload)
  }
}

const deleteProfile = async (): Promise<void> => {
  if (!selectedProfile.value) return

  if (usedDeviceCount.value > 0) {
    window.alert(t('profiles.delete.used', { count: usedDeviceCount.value }))
    return
  }

  if (!window.confirm(t('profiles.delete.confirm', { name: selectedProfile.value.name }))) {
    return
  }

  const deleted = await headset.deleteStreamProfile(selectedProfile.value.id)
  if (deleted) {
    selectProfileImmediately(profiles.value[0] ?? null)
  }
}

const resolvePendingSelection = (): void => {
  const targetId = pendingProfileId.value
  pendingProfileId.value = null

  if (targetId === '__create__') {
    isCreating.value = true
    selectedProfileId.value = null
    draft.value = createNewProfileDraft()
    resetDraftTracking()
    return
  }

  selectProfileImmediately(profiles.value.find((profile) => profile.id === targetId) ?? null)
}

const saveAndSwitch = async (): Promise<void> => {
  if (await saveDraft()) {
    resolvePendingSelection()
  }
}

const discardAndSwitch = (): void => {
  resolvePendingSelection()
}
</script>

<template>
  <section class="section-content profiles-section" aria-labelledby="profiles-title">
    <div class="section-heading">
      <h2 id="profiles-title">{{ t('profiles.title') }}</h2>
      <p class="muted-text">{{ t('profiles.description') }}</p>
    </div>
    <div class="profiles-layout">
      <aside class="profile-list-panel">
        <div class="card-header">
          <h3>
            {{ t('profiles.list.title') }} <span class="count-badge">{{ profiles.length }}</span>
          </h3>
          <button
            type="button"
            class="text-button"
            :disabled="headset.isConfigLoading.value"
            @click="startCreate"
          >
            + {{ t('common.actions.add') }}
          </button>
        </div>
        <p v-if="!profiles.length" class="muted-text">{{ t('profiles.list.emptyDescription') }}</p>
        <div class="profile-list">
          <button
            v-for="profile in profiles"
            :key="profile.id"
            type="button"
            class="profile-list-item"
            :class="{ active: profile.id === selectedProfileId && !isCreating }"
            :aria-pressed="profile.id === selectedProfileId && !isCreating"
            :disabled="headset.isConfigLoading.value"
            @click="requestProfileSelection(profile.id)"
          >
            <span>{{ profile.name }}</span
            ><small
              >{{ profile.maxSize ?? '∞' }} px · {{ profile.maxFps ?? '∞' }} FPS ·
              {{ profile.videoBitRate || '—' }}</small
            >
          </button>
        </div>
      </aside>
      <form class="profile-editor info-card" @submit.prevent="saveDraft">
        <div class="card-header">
          <div>
            <h3>{{ draft.name || t('profiles.editor.createTitle') }}</h3>
            <p class="field-hint">{{ t('profiles.editor.appliesNext') }}</p>
          </div>
          <span v-if="hasUnsavedChanges" class="unsaved-badge">{{
            t('profiles.editor.unsaved')
          }}</span
          ><span v-else-if="savedNotice" class="saved-notice" role="status"
            >✓ {{ t('profiles.editor.saved') }}</span
          >
        </div>
        <p v-if="!isCreating && !selectedProfile" class="muted-text">
          {{ t('profiles.editor.noSelectionDescription') }}
        </p>
        <template v-else>
          <fieldset class="profile-fields" :disabled="headset.isConfigLoading.value">
            <div class="profile-field-grid">
              <label class="profile-field"
                ><span>{{ t('profiles.fields.name') }}</span
                ><input
                  v-model="draft.name"
                  type="text"
                  autocomplete="off"
                  :aria-invalid="submitAttempted && validationKey === 'nameRequired'"
                  :placeholder="t('profiles.placeholders.name')"
              /></label>
              <label class="profile-field"
                ><span>{{ t('profiles.fields.description') }}</span
                ><input
                  v-model="draft.description"
                  type="text"
                  :placeholder="t('profiles.placeholders.description')"
              /></label>
            </div>
            <section class="profile-form-section">
              <h4>{{ t('profiles.presets.title') }}</h4>
              <div class="quality-presets">
                <button
                  v-for="preset in qualityPresets"
                  :key="preset.id"
                  type="button"
                  class="quality-preset"
                  :class="{ active: matchesPreset(preset) }"
                  :aria-pressed="matchesPreset(preset)"
                  @click="applyPreset(preset)"
                >
                  <strong>{{ t(`profiles.presets.${preset.id}`) }}</strong
                  ><span>{{ preset.maxSize }} px · {{ preset.maxFps }} FPS</span
                  ><small>{{ t(`profiles.presets.${preset.id}Hint`) }}</small>
                </button>
              </div>
            </section>
            <div class="profile-field-grid video-settings">
              <label class="profile-field"
                ><span>{{ t('profiles.fields.maxSize') }}</span
                ><select v-model="draft.maxSize">
                  <option value="">{{ t('profiles.options.unlimited') }}</option>
                  <option
                    v-if="
                      draft.maxSize && !['1024', '1280', '1600', '1920'].includes(draft.maxSize)
                    "
                    :value="draft.maxSize"
                  >
                    {{ draft.maxSize }} px
                  </option>
                  <option
                    v-for="size in ['1024', '1280', '1600', '1920']"
                    :key="size"
                    :value="size"
                  >
                    {{ size }} px
                  </option>
                </select></label
              >
              <label class="profile-field"
                ><span>{{ t('profiles.fields.maxFps') }}</span
                ><select v-model="draft.maxFps">
                  <option value="">{{ t('profiles.options.unlimited') }}</option>
                  <option
                    v-if="draft.maxFps && !['30', '60', '72', '90'].includes(draft.maxFps)"
                    :value="draft.maxFps"
                  >
                    {{ draft.maxFps }} FPS
                  </option>
                  <option v-for="fps in ['30', '60', '72', '90']" :key="fps" :value="fps">
                    {{ fps }} FPS
                  </option>
                </select></label
              >
              <label class="profile-field"
                ><span>{{ t('profiles.fields.videoBitRate') }}</span
                ><input
                  v-model="draft.videoBitRate"
                  :placeholder="t('profiles.placeholders.videoBitRate')"
                /><small>{{ t('profiles.hints.videoBitRate') }}</small></label
              >
              <label class="profile-toggle audio-toggle"
                ><input v-model="draft.noAudio" type="checkbox" /><span>{{
                  t('profiles.fields.noAudio')
                }}</span></label
              >
            </div>
            <details
              class="advanced-settings"
              :open="submitAttempted && validationKey === 'cropFormat'"
            >
              <summary>{{ t('profiles.sections.advanced') }}</summary>
              <div class="profile-field-grid">
                <label class="profile-field"
                  ><span>{{ t('profiles.fields.crop') }}</span
                  ><input
                    v-model="draft.crop"
                    :placeholder="t('profiles.placeholders.crop')"
                  /><small>{{ t('profiles.hints.crop') }}</small></label
                >
                <label class="profile-field"
                  ><span>{{ t('profiles.fields.videoCodec') }}</span
                  ><select v-model="draft.videoCodec">
                    <option value="h264">H.264</option>
                    <option value="h265">H.265</option></select
                  ><small>{{ t('profiles.hints.videoCodec') }}</small></label
                >
              </div>
              <details class="command-details">
                <summary>{{ t('profiles.sections.preview') }}</summary>
                <div class="command-preview">
                  <code>scrcpy {{ previewArgs.join(' ') }}</code>
                </div>
              </details>
            </details>
          </fieldset>
          <p
            v-if="submitAttempted && validationMessage"
            class="state-message error-message"
            role="alert"
          >
            {{ validationMessage }}
          </p>
          <div class="profile-actions">
            <button
              type="button"
              class="danger-button"
              :disabled="headset.isConfigLoading.value || isCreating || !selectedProfile"
              @click="deleteProfile"
            >
              {{ t('common.actions.delete') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="
                headset.isConfigLoading.value || isCreating || !selectedProfile || hasUnsavedChanges
              "
              :title="hasUnsavedChanges ? t('profiles.editor.saveBeforeDuplicate') : undefined"
              @click="duplicateProfile"
            >
              {{ t('common.actions.duplicate') }}
            </button>
            <button
              type="submit"
              class="primary-button"
              :disabled="headset.isConfigLoading.value || (!hasUnsavedChanges && !isCreating)"
            >
              {{
                headset.isConfigLoading.value
                  ? t('common.actions.saving')
                  : t('common.actions.save')
              }}
            </button>
          </div>
        </template>
      </form>
    </div>
    <AppModal
      v-if="showUnsavedDialog"
      labelledby="unsaved-profile-title"
      :busy="headset.isConfigLoading.value"
      @close="pendingProfileId = null"
    >
      <section class="modal-panel">
        <h3 id="unsaved-profile-title">{{ t('profiles.unsaved.title') }}</h3>
        <p class="muted-text">{{ t('profiles.unsaved.description') }}</p>
        <div class="modal-actions">
          <button
            type="button"
            class="text-button"
            :disabled="headset.isConfigLoading.value"
            @click="pendingProfileId = null"
          >
            {{ t('profiles.unsaved.cancel') }}
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="headset.isConfigLoading.value"
            @click="discardAndSwitch"
          >
            {{ t('profiles.unsaved.discard') }}
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="headset.isConfigLoading.value"
            @click="saveAndSwitch"
          >
            {{ t('profiles.unsaved.save') }}
          </button>
        </div>
      </section>
    </AppModal>
  </section>
</template>
