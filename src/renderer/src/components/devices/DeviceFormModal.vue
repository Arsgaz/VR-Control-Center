<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

const validationError = computed(() => {
  const trimmedName = name.value.trim()
  const trimmedAddress = address.value.trim()

  if (!trimmedName) {
    return t('dialogs.validation.deviceNameRequired')
  }

  if (!trimmedAddress) {
    return t('dialogs.validation.deviceAddressRequired')
  }

  if (!isDeviceAddress(trimmedAddress)) {
    return t('dialogs.validation.deviceAddressFormat')
  }

  const duplicate = props.devices.find((device) => {
    return device.id !== props.device?.id && device.address.trim() === trimmedAddress
  })

  if (duplicate) {
    return t('dialogs.validation.deviceAddressUnique')
  }

  if (
    streamProfileId.value !== null &&
    !props.streamProfiles.some((profile) => profile.id === streamProfileId.value)
  ) {
    return t('dialogs.validation.streamProfileMissing')
  }

  return null
})

const createDeviceId = (): string => {
  return `device-${globalThis.crypto.randomUUID()}`
}

const submit = (): void => {
  submitAttempted.value = true
  if (validationError.value) {
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
  <div class="modal-backdrop" role="presentation" @click.self="$emit('cancel')">
    <form class="modal-panel" aria-labelledby="device-form-title" @submit.prevent="submit">
      <div class="card-header">
        <div>
          <p class="section-label">{{ t('devices.form.addTitle') }}</p>
          <h3 id="device-form-title">{{ title }}</h3>
        </div>
      </div>

      <div class="modal-form-grid">
        <label>
          <span>{{ t('devices.form.name') }}</span>
          <input
            v-model="name"
            type="text"
            autocomplete="off"
            :placeholder="t('devices.form.namePlaceholder')"
          />
        </label>

        <label>
          <span>{{ t('devices.form.address') }}</span>
          <input
            v-model="address"
            type="text"
            autocomplete="off"
            :placeholder="t('devices.form.addressPlaceholder')"
          />
        </label>

        <label>
          <span>{{ t('devices.form.streamProfile') }}</span>
          <select v-model="streamProfileId">
            <option :value="null">{{ t('devices.form.noProfile') }}</option>
            <option v-for="profile in streamProfiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="submitAttempted && validationError" class="state-message error-message">
        {{ validationError }}
      </p>

      <div class="modal-actions">
        <button
          v-if="device"
          type="button"
          class="danger-button"
          @click="$emit('delete', device)"
        >
          {{ t('common.actions.delete') }}
        </button>
        <button type="button" class="secondary-button" @click="$emit('cancel')">
          {{ t('common.actions.cancel') }}
        </button>
        <button type="submit" class="primary-button">
          {{ isEditing ? t('common.actions.save') : t('common.actions.add') }}
        </button>
      </div>
    </form>
  </div>
</template>
