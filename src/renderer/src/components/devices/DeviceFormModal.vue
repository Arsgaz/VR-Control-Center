<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModal from '../ui/AppModal.vue'
import { useI18n } from 'vue-i18n'
import { isDeviceAddress } from '../../../../shared/config/config.validation'
import type {
  DeviceConfig,
  NewDeviceConfig,
  StreamProfileConfig
} from '../../../../shared/contracts/config.contracts'

const props = defineProps<{
  devices: DeviceConfig[]
  streamProfiles: StreamProfileConfig[]
  device: DeviceConfig | null
  busy: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  create: [device: NewDeviceConfig]
  update: [id: string, changes: Omit<NewDeviceConfig, 'id'>]
  delete: [device: DeviceConfig]
}>()

const name = ref('')
const address = ref('')
const streamProfileId = ref<string | null>(null)
const submitAttempted = ref(false)
const { t } = useI18n()

const isEditing = computed(() => props.device !== null)
const title = computed(() =>
  isEditing.value ? t('devices.form.editTitle') : t('devices.form.addTitle')
)

const resetForm = (): void => {
  name.value = props.device?.name ?? ''
  address.value = props.device?.address ?? ''
  streamProfileId.value = props.device?.streamProfileId ?? props.streamProfiles[0]?.id ?? null
  submitAttempted.value = false
}

watch(
  () => [props.device, props.streamProfiles] as const,
  () => resetForm(),
  { immediate: true }
)

const validationField = computed(() => {
  const trimmedName = name.value.trim()
  const trimmedAddress = address.value.trim()

  if (!trimmedName) {
    return { field: 'name', message: t('dialogs.validation.deviceNameRequired') }
  }

  if (!trimmedAddress) {
    return { field: 'address', message: t('dialogs.validation.deviceAddressRequired') }
  }

  if (!isDeviceAddress(trimmedAddress)) {
    return { field: 'address', message: t('dialogs.validation.deviceAddressFormat') }
  }

  const duplicate = props.devices.find((device) => {
    return device.id !== props.device?.id && device.address.trim() === trimmedAddress
  })

  if (duplicate) {
    return { field: 'address', message: t('dialogs.validation.deviceAddressUnique') }
  }

  if (
    streamProfileId.value !== null &&
    !props.streamProfiles.some((profile) => profile.id === streamProfileId.value)
  ) {
    return { field: 'profile', message: t('dialogs.validation.streamProfileMissing') }
  }

  return null
})

const createDeviceId = (): string => {
  return `device-${globalThis.crypto.randomUUID()}`
}

const submit = (): void => {
  submitAttempted.value = true
  if (props.busy) return
  if (validationField.value) {
    return
  }

  const payload = {
    name: name.value.trim(),
    address: address.value.trim(),
    streamProfileId: streamProfileId.value
  }

  if (props.device) {
    emit('update', props.device.id, payload)
    return
  }

  emit('create', {
    id: createDeviceId(),
    ...payload
  })
}
</script>

<template>
  <AppModal labelledby="device-form-title" :busy="busy" @close="$emit('cancel')">
    <form class="modal-panel" aria-labelledby="device-form-title" @submit.prevent="submit">
      <div class="card-header">
        <div>
          <h3 id="device-form-title">{{ title }}</h3>
        </div>
      </div>

      <fieldset class="modal-form-grid" :disabled="busy">
        <label>
          <span>{{ t('devices.form.name') }}</span>
          <input
            v-model="name"
            autofocus
            :aria-invalid="submitAttempted && validationField?.field === 'name'"
            :aria-describedby="
              submitAttempted && validationField?.field === 'name' ? 'device-name-error' : undefined
            "
            type="text"
            autocomplete="off"
            :placeholder="t('devices.form.namePlaceholder')"
          />
          <small
            v-if="submitAttempted && validationField?.field === 'name'"
            id="device-name-error"
            class="field-error"
            >{{ validationField.message }}</small
          >
        </label>

        <label>
          <span>{{ t('devices.form.address') }}</span>
          <input
            v-model="address"
            :aria-invalid="submitAttempted && validationField?.field === 'address'"
            aria-describedby="device-address-hint device-address-error"
            type="text"
            autocomplete="off"
            :placeholder="t('devices.form.addressPlaceholder')"
          />
          <small id="device-address-hint" class="field-hint">{{
            t('devices.form.addressHint')
          }}</small>
          <small
            v-if="submitAttempted && validationField?.field === 'address'"
            id="device-address-error"
            class="field-error"
            >{{ validationField.message }}</small
          >
        </label>

        <label>
          <span>{{ t('devices.form.streamProfile') }}</span>
          <select v-model="streamProfileId">
            <option :value="null">{{ t('devices.form.noProfile') }}</option>
            <option v-for="profile in streamProfiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
          <small
            v-if="submitAttempted && validationField?.field === 'profile'"
            class="field-error"
            >{{ validationField.message }}</small
          >
        </label>
      </fieldset>
      <p v-if="error" class="state-message error-message" role="alert">{{ error }}</p>

      <div class="modal-actions">
        <button
          v-if="device"
          type="button"
          class="danger-button"
          :disabled="busy"
          @click="$emit('delete', device)"
        >
          {{ t('common.actions.delete') }}
        </button>
        <button type="button" class="secondary-button" :disabled="busy" @click="$emit('cancel')">
          {{ t('common.actions.cancel') }}
        </button>
        <button type="submit" class="primary-button" :disabled="busy">
          {{
            busy
              ? t('common.actions.saving')
              : isEditing
                ? t('common.actions.save')
                : t('common.actions.add')
          }}
        </button>
      </div>
    </form>
  </AppModal>
</template>
