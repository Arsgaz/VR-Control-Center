import enCommon from '../locales/en/common.json'
import enDevices from '../locales/en/devices.json'
import enDialogs from '../locales/en/dialogs.json'
import enLogger from '../locales/en/logger.json'
import enProfiles from '../locales/en/profiles.json'
import enSettings from '../locales/en/settings.json'
import ruCommon from '../locales/ru/common.json'
import ruDevices from '../locales/ru/devices.json'
import ruDialogs from '../locales/ru/dialogs.json'
import ruLogger from '../locales/ru/logger.json'
import ruProfiles from '../locales/ru/profiles.json'
import ruSettings from '../locales/ru/settings.json'
import type { AppLanguage } from '../../../shared/contracts/config.contracts'

const modules = {
  en: {
    common: enCommon,
    devices: enDevices,
    dialogs: enDialogs,
    logger: enLogger,
    profiles: enProfiles,
    settings: enSettings
  },
  ru: {
    common: ruCommon,
    devices: ruDevices,
    dialogs: ruDialogs,
    logger: ruLogger,
    profiles: ruProfiles,
    settings: ruSettings
  }
} satisfies Record<AppLanguage, Record<string, unknown>>

export const messages = modules
