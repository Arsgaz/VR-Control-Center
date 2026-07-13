import { computed, ref } from 'vue'
import {
  appendUserEvent,
  clearUserEvents,
  createUserEventEntry,
  type UserEventEntry,
  type UserEventInput
} from './event-log.model'

const LOG_LIMIT = 80

const entries = ref<UserEventEntry[]>([])
const isCollapsed = ref(false)
let nextId = 1

export const useEventLog = () => {
  const visibleEntries = computed(() => entries.value.slice(0, isCollapsed.value ? 0 : 8))

  const addEvent = (input: UserEventInput): void => {
    const entry = createUserEventEntry(input, nextId)
    nextId += 1
    entries.value = appendUserEvent(entries.value, entry, LOG_LIMIT)
  }

  const clearEvents = (): void => {
    entries.value = clearUserEvents()
  }

  const toggleCollapsed = (): void => {
    isCollapsed.value = !isCollapsed.value
  }

  return {
    entries,
    visibleEntries,
    isCollapsed,
    addEvent,
    clearEvents,
    toggleCollapsed
  }
}
