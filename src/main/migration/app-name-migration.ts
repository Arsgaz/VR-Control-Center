import { access, copyFile, mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import { logger } from '../logger/logger'

const LEGACY_APP_DIRECTORY_NAME = 'arena-control-center'
const CONFIG_FILE_NAME = 'config.json'

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export const migrateLegacyApplicationData = async (): Promise<void> => {
  const currentUserDataDirectory = app.getPath('userData')
  const currentDirectoryName = basename(currentUserDataDirectory)

  if (currentDirectoryName === LEGACY_APP_DIRECTORY_NAME) {
    logger.debug('Skipping legacy data migration because current app directory is legacy')
    return
  }

  const legacyUserDataDirectory = join(dirname(currentUserDataDirectory), LEGACY_APP_DIRECTORY_NAME)
  const legacyConfigFile = join(legacyUserDataDirectory, CONFIG_FILE_NAME)
  const currentConfigFile = join(currentUserDataDirectory, CONFIG_FILE_NAME)

  if (!(await fileExists(legacyConfigFile))) {
    logger.debug('No legacy configuration file found', { legacyConfigFile })
    return
  }

  if (await fileExists(currentConfigFile)) {
    logger.info('Skipping legacy configuration migration because current config already exists', {
      currentConfigFile,
      legacyConfigFile
    })
    return
  }

  await mkdir(currentUserDataDirectory, { recursive: true })
  await copyFile(legacyConfigFile, currentConfigFile)
  logger.info('Migrated legacy configuration file', {
    legacyConfigFile,
    currentConfigFile
  })
}
