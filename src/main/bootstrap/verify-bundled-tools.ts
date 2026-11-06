import { writeFile } from 'node:fs/promises'
import { app } from 'electron'
import { checkAdb } from '@main/infrastructure/adb/adb.service'
import { checkScrcpy } from '@main/infrastructure/scrcpy/scrcpy.service'
import { createBinaryResolverFromSettings } from '@main/infrastructure/binaries/binary-resolver'
import { createDefaultConfig } from '@shared/config/default-config'

// Used by Windows release CI. No windows, saved configuration or ADB connections.
export const verifyBundledTools = async (outputFile: string): Promise<boolean> => {
  const resolver = createBinaryResolverFromSettings(createDefaultConfig().settings)
  const [adb, scrcpy] = await Promise.all([checkAdb(resolver), checkScrcpy(resolver)])
  await writeFile(
    outputFile,
    JSON.stringify(
      {
        version: app.getVersion(),
        resolved: {
          adb: resolver.adb(),
          scrcpy: resolver.scrcpy(),
          server: resolver.scrcpyServer?.()
        },
        adb,
        scrcpy
      },
      null,
      2
    ) + '\n'
  )
  return adb.available && scrcpy.available
}
