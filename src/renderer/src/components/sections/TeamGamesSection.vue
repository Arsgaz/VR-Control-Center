<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TeamGameConfig } from '../../../../shared/contracts/team-games.contracts'
import TeamGameArtwork from '../team-games/TeamGameArtwork.vue'
import AppModal from '../ui/AppModal.vue'
import { useAppConfig } from '../../composables/useAppConfig'
import { useEventLog } from '../../composables/useEventLog'

const { t } = useI18n()
const appConfig = useAppConfig()
const { addEvent } = useEventLog()
const games = computed(() => appConfig.config.value?.teamGames ?? [])
const steamIconRevision = ref(0)
const syncingSteam = ref(false)
const steamFeedback = ref('')
const syncSteam = async (chooseDirectory = false): Promise<void> => {
  if (syncingSteam.value) return
  syncingSteam.value = true
  steamFeedback.value = ''
  try {
    const result = await appConfig.syncSteam(chooseDirectory)
    if (result && !result.canceled) steamIconRevision.value++
    if (!result) steamFeedback.value = t('teamGames.errors.steamSync')
    else if (!result.canceled)
      steamFeedback.value = !result.found
        ? t('teamGames.steamNotFound')
        : t('teamGames.steamSummary', { added: result.added, unresolved: result.unresolved })
  } catch {
    steamFeedback.value = t('teamGames.errors.steamSync')
  } finally {
    syncingSteam.value = false
  }
}
onMounted(async () => {
  await appConfig.loadConfig()
  await syncSteam()
})
const launching = ref(new Set<string>())
const feedback = ref<Record<string, string>>({})
const editing = ref(false)
const creating = ref(false)
const busy = ref(false)
const choosing = ref(false)
const error = ref('')
const draft = ref<TeamGameConfig>({ id: '', name: '', description: '', shortcutPath: '' })
let original = ''

const openEditor = (game?: TeamGameConfig): void => {
  creating.value = !game
  draft.value = game
    ? { ...game }
    : { id: window.crypto.randomUUID(), name: '', description: '', shortcutPath: '' }
  original = JSON.stringify(draft.value)
  error.value = ''
  editing.value = true
}
const closeEditor = (): void => {
  if (busy.value || choosing.value) return
  if (JSON.stringify(draft.value) !== original && !window.confirm(t('teamGames.discard'))) return
  editing.value = false
}
const chooseShortcut = async (): Promise<void> => {
  choosing.value = true
  error.value = ''
  try {
    const result = await window.vrControl.teamGames.selectShortcut()
    if (!result.canceled && result.path) {
      draft.value.shortcutPath = result.path
      if (!draft.value.name.trim()) draft.value.name = result.name.slice(0, 100)
    }
  } catch {
    error.value = t('teamGames.errors.select')
  } finally {
    choosing.value = false
  }
}
const chooseIcon = async (): Promise<void> => {
  if (busy.value || choosing.value) return
  choosing.value = true
  error.value = ''
  try {
    const result = await window.vrControl.teamGames.selectIcon()
    if (!result.canceled) draft.value.customIcon = result.icon
  } catch {
    error.value = t('teamGames.errors.icon')
  } finally {
    choosing.value = false
  }
}
const save = async (): Promise<void> => {
  if (busy.value || choosing.value) return
  busy.value = true
  error.value = ''
  try {
    const saved = await appConfig.saveTeamGame({ ...draft.value })
    if (saved) {
      editing.value = false
      addEvent({ level: 'success', message: t('teamGames.saved', { name: draft.value.name }) })
    } else error.value = t('teamGames.errors.save')
  } catch {
    error.value = t('teamGames.errors.save')
  } finally {
    busy.value = false
  }
}
const remove = async (): Promise<void> => {
  if (busy.value || !window.confirm(t('teamGames.confirmRemove', { name: draft.value.name })))
    return
  busy.value = true
  error.value = ''
  try {
    if (await appConfig.deleteTeamGame(draft.value.id)) editing.value = false
    else error.value = t('teamGames.errors.remove')
  } catch {
    error.value = t('teamGames.errors.remove')
  } finally {
    busy.value = false
  }
}
const launch = async (game: TeamGameConfig): Promise<void> => {
  if (launching.value.has(game.id)) return
  launching.value.add(game.id)
  feedback.value[game.id] = ''
  try {
    feedback.value[game.id] = game.requiresSteamVr
      ? t('teamGames.startingSteamVr')
      : t('teamGames.launching')
    const result = await window.vrControl.teamGames.launch(game.id)
    const message = result.ok ? t('teamGames.requested') : t(`teamGames.errors.${result.error}`)
    feedback.value[game.id] = message
    addEvent({ level: result.ok ? 'info' : 'error', message: `${game.name}: ${message}` })
  } catch {
    feedback.value[game.id] = t('teamGames.errors.LAUNCH_FAILED')
  } finally {
    launching.value.delete(game.id)
  }
}
</script>

<template>
  <section class="section-content team-games-section" aria-labelledby="team-games-title">
    <div class="section-heading section-heading-row">
      <div>
        <div class="title-row">
          <h2 id="team-games-title">{{ t('teamGames.title') }}</h2>
          <span class="count-badge">{{ games.length }}</span>
        </div>
        <p class="muted-text">{{ t('teamGames.description') }}</p>
      </div>
      <div class="section-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="syncingSteam"
          @click="syncSteam()"
        >
          <AppIcon name="refresh" />{{
            syncingSteam ? t('teamGames.syncingSteam') : t('teamGames.syncSteam')
          }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="syncingSteam"
          @click="syncSteam(true)"
        >
          <AppIcon name="folder" />{{ t('teamGames.steamFolder') }}
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="!appConfig.config.value"
          @click="openEditor()"
        >
          <AppIcon name="plus" />{{ t('teamGames.add') }}
        </button>
      </div>
    </div>

    <p v-if="syncingSteam" class="muted-text" role="status">{{ t('teamGames.syncingSteam') }}</p>
    <p v-if="steamFeedback" class="field-hint" role="status">{{ steamFeedback }}</p>

    <div v-if="!games.length" class="empty-state-card team-games-empty">
      <div class="empty-device-symbol"><AppIcon name="monitor" :size="30" /></div>
      <h3>{{ t('teamGames.emptyTitle') }}</h3>
      <p class="muted-text">{{ t('teamGames.emptyDescription') }}</p>
      <button
        type="button"
        class="secondary-button"
        :disabled="!appConfig.config.value"
        @click="openEditor()"
      >
        <AppIcon name="plus" />{{ t('teamGames.add') }}
      </button>
    </div>
    <div v-else class="team-game-grid">
      <article v-for="game in games" :key="game.id" class="team-game-card">
        <TeamGameArtwork :game="game" :revision="steamIconRevision" />
        <div class="team-game-body">
          <h3>{{ game.name }}</h3>
          <p class="muted-text team-game-description">
            {{ game.description || t('teamGames.defaultDescription') }}
          </p>
          <div class="team-game-actions">
            <button
              type="button"
              class="primary-button"
              :disabled="launching.has(game.id)"
              @click="launch(game)"
            >
              <AppIcon name="play" />{{
                launching.has(game.id) ? t('teamGames.launching') : t('common.actions.start')
              }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="launching.has(game.id)"
              :aria-label="t('teamGames.editNamed', { name: game.name })"
              @click="openEditor(game)"
            >
              <AppIcon name="edit" />{{ t('common.actions.edit') }}
            </button>
          </div>
          <p v-if="feedback[game.id]" class="field-hint team-game-feedback" role="status">
            {{ feedback[game.id] }}
          </p>
        </div>
      </article>
    </div>

    <AppModal
      v-if="editing"
      labelledby="team-game-editor-title"
      :busy="busy || choosing"
      @close="closeEditor"
    >
      <form class="modal-panel team-game-editor" @submit.prevent="save">
        <div class="card-header">
          <h3 id="team-game-editor-title">
            {{ creating ? t('teamGames.add') : t('teamGames.edit') }}
          </h3>
          <button
            type="button"
            class="icon-button"
            :disabled="busy || choosing"
            :aria-label="t('common.actions.close')"
            @click="closeEditor"
          >
            <AppIcon name="close" />
          </button>
        </div>
        <label class="team-game-field">
          <span>{{ t('teamGames.name') }}</span>
          <input
            v-model="draft.name"
            type="text"
            required
            autofocus
            maxlength="100"
            :disabled="busy || choosing"
            :placeholder="t('teamGames.namePlaceholder')"
          />
        </label>
        <label class="team-game-field">
          <span>{{ t('teamGames.gameDescription') }}</span>
          <textarea
            v-model="draft.description"
            maxlength="400"
            rows="2"
            :disabled="busy || choosing"
            :placeholder="t('teamGames.descriptionPlaceholder')"
          />
        </label>
        <div class="team-game-field">
          <span>{{ t('teamGames.iconTitle') }}</span>
          <div class="team-game-icon-editor">
            <TeamGameArtwork :game="draft" />
            <div class="team-game-icon-controls">
              <div class="team-game-icon-actions">
                <button
                  type="button"
                  class="secondary-button"
                  :disabled="busy || choosing"
                  @click="chooseIcon"
                >
                  <AppIcon name="image" />{{ t('teamGames.chooseIcon') }}
                </button>
                <button
                  v-if="draft.customIcon"
                  type="button"
                  class="secondary-button"
                  :disabled="busy || choosing"
                  @click="draft.customIcon = null"
                >
                  {{ t(draft.steamAppId ? 'teamGames.resetSteamIcon' : 'teamGames.resetIcon') }}
                </button>
              </div>
              <p class="field-hint">
                {{ t(draft.steamAppId ? 'teamGames.steamIconHint' : 'teamGames.iconHint') }}
              </p>
            </div>
          </div>
        </div>
        <label class="steamvr-option">
          <input v-model="draft.requiresSteamVr" type="checkbox" :disabled="busy || choosing" />
          <span>{{ t('teamGames.requiresSteamVr') }}</span>
        </label>
        <p class="field-hint">{{ t('teamGames.steamVrHint') }}</p>
        <p v-if="draft.steamAppId" class="field-hint">Steam AppID: {{ draft.steamAppId }}</p>
        <div v-if="!draft.steamAppId" class="team-game-field">
          <label for="team-game-shortcut">{{ t('teamGames.shortcut') }}</label>
          <div class="team-game-path">
            <input
              id="team-game-shortcut"
              v-model="draft.shortcutPath"
              type="text"
              required
              maxlength="4096"
              :disabled="busy || choosing"
              :placeholder="t('teamGames.shortcutPlaceholder')"
            />
            <button
              type="button"
              class="secondary-button"
              :disabled="busy || choosing"
              @click="chooseShortcut"
            >
              <AppIcon name="folder" />{{ t('teamGames.choose') }}
            </button>
          </div>
          <p class="field-hint">{{ t('teamGames.shortcutHint') }}</p>
        </div>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <div class="team-game-editor-actions">
          <button
            v-if="!creating"
            type="button"
            class="danger-button"
            :disabled="busy || choosing"
            @click="remove"
          >
            {{ t('common.actions.delete') }}
          </button>
          <div class="team-game-editor-submit">
            <button
              type="button"
              class="secondary-button"
              :disabled="busy || choosing"
              @click="closeEditor"
            >
              {{ t('common.actions.cancel') }}
            </button>
            <button
              type="submit"
              class="primary-button"
              :disabled="
                busy ||
                choosing ||
                !draft.name.trim() ||
                (!draft.steamAppId && !draft.shortcutPath.trim())
              "
            >
              {{ busy ? t('common.actions.saving') : t('common.actions.save') }}
            </button>
          </div>
        </div>
      </form>
    </AppModal>
  </section>
</template>

<style scoped>
.team-game-icon-editor {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}
.team-game-icon-controls {
  display: grid;
  gap: 8px;
}
.team-game-icon-editor :deep(.team-game-art) {
  height: 80px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.team-game-icon-editor :deep(.game-image) {
  width: 60px;
  height: 60px;
}
.team-game-icon-editor :deep(.arena-mark),
.team-game-icon-editor :deep(.team-game-platform) {
  display: none;
}
.team-game-field {
  font-size: 0.86rem;
}

.steamvr-option {
  display: flex;
  align-items: center;
  gap: 10px;
}
.steamvr-option input {
  accent-color: var(--accent);
}
.team-game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 22px;
}
.team-game-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
.team-game-icon-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.team-game-body {
  padding: 22px;
}
.team-game-body h3 {
  overflow-wrap: anywhere;
  font-size: 1.12rem;
}
.team-game-description {
  margin: 10px 0 22px;
  min-height: 40px;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.team-game-actions {
  display: flex;
  gap: 10px;
}
.team-game-actions .primary-button {
  flex: 1;
}
.team-game-feedback {
  margin: 14px 0 0;
  line-height: 1.5;
}
.team-games-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
  padding: 56px 24px;
}
.team-games-empty p {
  max-width: 480px;
}
.team-game-editor {
  display: grid;
  gap: 16px;
}
.team-game-field {
  display: grid;
  gap: 9px;
}
.team-game-field input,
.team-game-field textarea {
  width: 100%;
  padding: 12px;
  color: inherit;
  font: inherit;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-inset);
}
.team-game-field textarea {
  resize: vertical;
}
.team-game-path {
  display: flex;
  gap: 10px;
}
.team-game-path input {
  min-width: 0;
  flex: 1;
}
.team-game-editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.team-game-editor-submit {
  display: flex;
  gap: 10px;
  margin-left: auto;
}
.error-text {
  color: #ff9a9a;
}
</style>
