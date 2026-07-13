<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const hasUnsavedChanges = computed(() => JSON.stringify(draft.value) !== serializedInitialDraft.value)

const fieldLabel = (key: string, technicalName: string): string => {
  return `${t(`profiles.fields.${key}`)} (${technicalName})`
}

const bitratePresets = ['4M', '6M', '8M', '12M']

const resetDraftTracking = (): void => {
  serializedInitialDraft.value = JSON.stringify(draft.value)
  submitAttempted.value = false
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
  return devices.value.filter((device) => device.streamProfileId === selectedProfile.value?.id).length
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
  <section class="section-content" aria-labelledby="profiles-title">
    <div class="section-heading">
      <p class="section-label">{{ t('profiles.label') }}</p>
      <h2 id="profiles-title">{{ t('profiles.title') }}</h2>
      <p class="muted-text">
        {{ t('profiles.description') }}
      </p>
    </div>

    <div class="profiles-layout">
      <aside class="profile-list-panel info-card">
        <div class="card-header">
          <div>
            <p class="section-label">{{ t('profiles.list.title') }}</p>
            <h3>{{ profiles.length }}</h3>
          </div>
          <button type="button" class="primary-button compact-button" @click="startCreate">
            {{ t('profiles.list.add') }}
          </button>
        </div>

        <div v-if="profiles.length === 0" class="empty-profile-list">
          <h3>{{ t('profiles.list.emptyTitle') }}</h3>
          <p class="muted-text">{{ t('profiles.list.emptyDescription') }}</p>
        </div>

        <div v-else class="profile-list">
          <button
            v-for="profile in profiles"
            :key="profile.id"
            type="button"
            class="profile-list-item"
            :class="{ active: profile.id === selectedProfileId && !isCreating }"
            @click="requestProfileSelection(profile.id)"
          >
            <span>{{ profile.name }}</span>
            <small>{{ profile.videoCodec.toUpperCase() }} · {{ profile.videoBitRate || '—' }}</small>
          </button>
        </div>
      </aside>

      <form class="profile-editor info-card" @submit.prevent="saveDraft">
        <div class="card-header">
          <div>
            <p class="section-label">
              {{ isCreating ? t('profiles.editor.createTitle') : t('profiles.editor.editTitle') }}
            </p>
            <h3>
              {{
                isCreating || selectedProfile
                  ? draft.name || t('profiles.editor.createTitle')
                  : t('profiles.editor.noSelectionTitle')
              }}
            </h3>
          </div>
          <span v-if="hasUnsavedChanges" class="unsaved-badge">
            {{ t('profiles.editor.unsaved') }}
          </span>
        </div>

        <p v-if="!isCreating && !selectedProfile" class="muted-text">
          {{ t('profiles.editor.noSelectionDescription') }}
        </p>

        <template v-else>
          <section class="profile-form-section">
            <h4>{{ t('profiles.sections.general') }}</h4>
            <label class="profile-field">
              <span>{{ fieldLabel('name', 'name') }}</span>
              <input
                v-model="draft.name"
                type="text"
                autocomplete="off"
                :placeholder="t('profiles.placeholders.name')"
              />
              <small>{{ t('profiles.hints.name') }}</small>
            </label>

            <label class="profile-field">
              <span>{{ fieldLabel('description', 'description') }}</span>
              <textarea
                v-model="draft.description"
                rows="3"
                :placeholder="t('profiles.placeholders.description')"
              />
              <small>{{ t('profiles.hints.description') }}</small>
            </label>
          </section>

          <section class="profile-form-section">
            <h4>{{ t('profiles.sections.geometry') }}</h4>
            <div class="profile-field-grid">
              <label class="profile-field">
                <span>{{ fieldLabel('crop', 'crop') }}</span>
                <input
                  v-model="draft.crop"
                  type="text"
                  autocomplete="off"
                  :placeholder="t('profiles.placeholders.crop')"
                />
                <small>{{ t('profiles.hints.crop') }}</small>
              </label>

              <label class="profile-field">
                <span>{{ fieldLabel('maxSize', 'maxSize') }}</span>
                <select v-model="draft.maxSize">
                  <option value="">{{ t('profiles.options.unlimited') }}</option>
                  <option value="1024">1024</option>
                  <option value="1280">1280</option>
                  <option value="1600">1600</option>
                  <option value="1920">1920</option>
                </select>
                <small>{{ t('profiles.hints.maxSize') }}</small>
              </label>
            </div>
          </section>

          <section class="profile-form-section">
            <h4>{{ t('profiles.sections.video') }}</h4>
            <div class="profile-video-grid">
              <div class="profile-video-column">
                <label class="profile-field">
                  <span>{{ fieldLabel('maxFps', 'maxFps') }}</span>
                  <select v-model="draft.maxFps">
                    <option value="">{{ t('profiles.options.unlimited') }}</option>
                    <option value="30">30</option>
                    <option value="60">60</option>
                    <option value="72">72</option>
                    <option value="90">90</option>
                  </select>
                  <small>{{ t('profiles.hints.maxFps') }}</small>
                </label>

                <label class="profile-field">
                  <span>{{ fieldLabel('videoCodec', 'videoCodec') }}</span>
                  <select v-model="draft.videoCodec">
                    <option value="h264">{{ t('profiles.options.h264') }}</option>
                    <option value="h265">{{ t('profiles.options.h265') }}</option>
                  </select>
                  <small>{{ t('profiles.hints.videoCodec') }}</small>
                </label>
              </div>

              <div class="profile-video-column">
                <label class="profile-field">
                <span>{{ fieldLabel('videoBitRate', 'videoBitRate') }}</span>
                <input
                  v-model="draft.videoBitRate"
                  autocomplete="off"
                  :placeholder="t('profiles.placeholders.videoBitRate')"
                />
                <div class="profile-preset-row" :aria-label="t('profiles.options.bitratePresets')">
                  <button
                    v-for="preset in bitratePresets"
                    :key="preset"
                    type="button"
                    class="preset-button"
                    :class="{ active: draft.videoBitRate === preset }"
                    @click="draft.videoBitRate = preset"
                  >
                    {{ preset }}
                  </button>
                </div>
                <small>{{ t('profiles.hints.videoBitRate') }}</small>
                </label>
              </div>
            </div>
          </section>

          <section class="profile-form-section">
            <h4>{{ t('profiles.sections.audio') }}</h4>
            <label class="toggle-row profile-toggle">
              <input v-model="draft.noAudio" type="checkbox" />
              <span>{{ fieldLabel('noAudio', 'noAudio') }}</span>
            </label>
            <p class="field-hint">{{ t('profiles.hints.noAudio') }}</p>
          </section>

          <section class="profile-form-section">
            <h4>{{ t('profiles.sections.preview') }}</h4>
            <div class="command-preview" aria-live="polite">
              <code>scrcpy</code>
              <code v-for="(arg, index) in previewArgs" :key="`${arg}-${index}`">{{ arg }}</code>
            </div>
          </section>

          <p v-if="submitAttempted && validationMessage" class="state-message error-message">
            {{ validationMessage }}
          </p>

          <div class="profile-actions">
            <button type="submit" class="primary-button" :disabled="headset.isConfigLoading.value">
              {{ t('common.actions.save') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="isCreating || !selectedProfile"
              @click="duplicateProfile"
            >
              {{ t('common.actions.duplicate') }}
            </button>
            <button
              type="button"
              class="danger-button"
              :disabled="isCreating || !selectedProfile"
              @click="deleteProfile"
            >
              {{ t('common.actions.delete') }}
            </button>
          </div>
        </template>
      </form>
    </div>

    <div v-if="showUnsavedDialog" class="modal-backdrop" role="presentation">
      <section class="modal-panel" aria-labelledby="unsaved-profile-title">
        <div class="card-header">
          <div>
            <p class="section-label">{{ t('profiles.unsaved.title') }}</p>
            <h3 id="unsaved-profile-title">{{ t('profiles.unsaved.description') }}</h3>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-button" @click="pendingProfileId = null">
            {{ t('profiles.unsaved.cancel') }}
          </button>
          <button type="button" class="secondary-button" @click="discardAndSwitch">
            {{ t('profiles.unsaved.discard') }}
          </button>
          <button type="button" class="primary-button" @click="saveAndSwitch">
            {{ t('profiles.unsaved.save') }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
