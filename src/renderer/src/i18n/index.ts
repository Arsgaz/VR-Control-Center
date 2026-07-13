import { createI18n } from 'vue-i18n'
import type { AppLanguage } from '../../../shared/contracts/config.contracts'
import { messages } from './messages'

export const i18n = createI18n({
  legacy: false,
  locale: 'en' satisfies AppLanguage,
  fallbackLocale: 'en',
  messages
})

export const setI18nLanguage = (language: AppLanguage): void => {
  i18n.global.locale.value = language
  document.documentElement.lang = language
}

export const translate = (key: string, params?: Record<string, unknown>): string => {
  return i18n.global.t(key, params ?? {})
}
