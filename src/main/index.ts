import { app } from 'electron'
import { initializeApplicationIdentity } from './infrastructure/branding/branding'
import { createApplication } from './bootstrap/create-application'
import { verifyBundledTools } from './bootstrap/verify-bundled-tools'

initializeApplicationIdentity()

app.whenReady().then(async () => {
  const verification = process.argv.indexOf('--verify-bundled-tools')
  if (verification !== -1) {
    try {
      const output = process.argv[verification + 1]
      if (!output) throw new Error('Verification output path is required')
      app.exit((await verifyBundledTools(output)) ? 0 : 1)
    } catch (error) {
      console.error('Bundled tool verification failed', error)
      app.exit(1)
    }
    return
  }
  await createApplication()
})
