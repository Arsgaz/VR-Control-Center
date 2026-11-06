<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import { onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TeamGameConfig } from '../../../../shared/contracts/team-games.contracts'
import oneplaceMark from '../../assets/branding/oneplace-mark.svg'

const props = defineProps<{ game: TeamGameConfig; revision?: number }>()
const { t } = useI18n()
const image = ref<string | null>(null)
let generation = 0
let timer: number | undefined
watch(
  [
    () => props.game.shortcutPath,
    () => props.game.customIcon,
    () => props.game.steamAppId,
    () => props.revision
  ],
  () => {
    const current = ++generation
    window.clearTimeout(timer)
    image.value = null
    const request = {
      shortcutPath: props.game.shortcutPath,
      customIcon: props.game.customIcon,
      steamAppId: props.game.steamAppId
    }
    // Text-path edits should not invoke native icon extraction on every keystroke.
    timer = window.setTimeout(async () => {
      try {
        const result = await window.vrControl.teamGames.icon(request)
        if (current === generation) image.value = result
      } catch {
        if (current === generation) image.value = null
      }
    }, 200)
  },
  { immediate: true }
)
onUnmounted(() => {
  generation++
  window.clearTimeout(timer)
})
</script>

<template>
  <div class="team-game-art" aria-hidden="true">
    <span class="team-game-platform">{{ game.steamAppId ? 'SteamVR' : t('teamGames.local') }}</span>
    <img
      v-if="image"
      :class="game.steamAppId && !game.customIcon ? 'game-cover' : 'game-image'"
      :src="image"
      alt=""
      @error="image = null"
    />
    <span v-else class="team-game-monogram">
      <template v-if="game.name.trim()">{{ game.name.slice(0, 2).toLocaleUpperCase() }}</template>
      <AppIcon v-else name="image" :size="28" />
    </span>
    <img class="arena-mark" :src="oneplaceMark" alt="" />
  </div>
</template>

<style scoped>
.team-game-art {
  position: relative;
  height: 150px;
  display: grid;
  place-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}
.game-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.game-image {
  width: 112px;
  height: 112px;
  object-fit: contain;
}
.arena-mark {
  position: absolute;
  right: 20px;
  bottom: 20px;
  opacity: 0.25;
  width: 54px;
  height: 30px;
  object-fit: contain;
}
.team-game-monogram {
  font-family: var(--heading-font);
  font-size: 2.8rem;
  color: #f0ccf1;
  letter-spacing: -0.05em;
}
.team-game-platform {
  z-index: 1;
  padding: 4px 6px;
  border-radius: 4px;
  background: #060811c0;
  position: absolute;
  top: 16px;
  left: 18px;
  color: #efb8ed;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.62rem;
}
</style>
