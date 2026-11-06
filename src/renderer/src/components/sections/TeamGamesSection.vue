<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TeamGameConfig } from '../../../../shared/contracts/team-games.contracts'
import AppModal from '../ui/AppModal.vue'
import oneplaceMark from '../../assets/branding/oneplace-mark.svg'
import { useAppConfig } from '../../composables/useAppConfig'
import { useEventLog } from '../../composables/useEventLog'

const { t } = useI18n()
const appConfig = useAppConfig()
const { addEvent } = useEventLog()
const games = computed(() => appConfig.config.value?.teamGames ?? [])
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
      <button
        type="button"
        class="primary-button"
        :disabled="!appConfig.config.value"
        @click="openEditor()"
      >
        {{ t('teamGames.add') }}
      </button>
    </div>

    <div v-if="!games.length" class="empty-state-card team-games-empty">
      <div class="empty-device-symbol"><img :src="oneplaceMark" alt="" /></div>
      <h3>{{ t('teamGames.emptyTitle') }}</h3>
      <p class="muted-text">{{ t('teamGames.emptyDescription') }}</p>
      <button
        type="button"
        class="secondary-button"
        :disabled="!appConfig.config.value"
        @click="openEditor()"
      >
        {{ t('teamGames.add') }}
      </button>
    </div>
    <div v-else class="team-game-grid">
      <article v-for="game in games" :key="game.id" class="team-game-card">
        <div class="team-game-art" aria-hidden="true">
          <span class="team-game-platform">{{ t('teamGames.local') }}</span>
          <span class="team-game-monogram">{{ game.name.slice(0, 2).toLocaleUpperCase() }}</span>
          <img :src="oneplaceMark" alt="" />
        </div>
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
              {{ launching.has(game.id) ? t('teamGames.launching') : t('common.actions.start') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="launching.has(game.id)"
              :aria-label="t('teamGames.editNamed', { name: game.name })"
              @click="openEditor(game)"
            >
              {{ t('common.actions.edit') }}
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
            ×
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
            rows="3"
            :disabled="busy || choosing"
            :placeholder="t('teamGames.descriptionPlaceholder')"
          />
        </label>
        <div class="team-game-field">
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
              {{ t('teamGames.choose') }}
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
              :disabled="busy || choosing || !draft.name.trim() || !draft.shortcutPath.trim()"
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
.team-game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 22px;
}
.team-game-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
}
.team-game-art {
  position: relative;
  height: 150px;
  display: grid;
  place-items: center;
  border-bottom: 1px solid var(--border);
  background:
    radial-gradient(ellipse at 20% 0%, #8c197d66, transparent 70%),
    linear-gradient(135deg, #20132f, #0a0a15);
}
.team-game-art img {
  position: absolute;
  right: 20px;
  bottom: 20px;
  opacity: 0.25;
  width: 54px;
  height: 30px;
  object-fit: contain;
  filter: drop-shadow(0 10px 22px #fb07f522);
}
.team-game-monogram {
  font-family: var(--heading-font);
  font-size: 2.8rem;
  color: #f0ccf1;
  letter-spacing: -0.05em;
}
.team-game-platform {
  position: absolute;
  top: 16px;
  left: 18px;
  color: #efb8ed;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.62rem;
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
  gap: 22px;
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
  background: #090a16;
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
