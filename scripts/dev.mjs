import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { constants } from 'node:fs'
import { cp, copyFile, mkdir, mkdtemp, readFile, rename, rm, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const environment = { ...process.env }
// The dev command always launches an application, even from Node-based IDE hosts.
delete environment.ELECTRON_RUN_AS_NODE

async function macDevelopmentRuntime() {
  const source = resolve(dirname(require('electron')), '../..')
  const icon = join(root, 'resources/branding/icon.icns')
  const stamp = createHash('sha256')
    .update('vrcc-development-bundle-v1')
    .update(await readFile(join(source, 'Contents/Info.plist')))
    .update(await readFile(icon))
    .update(pkg.build.productName)
    .update(pkg.build.appId)
    .digest('hex')
    .slice(0, 16)
  const cache = join(root, 'node_modules/.cache/vr-control-center')
  const target = join(cache, stamp)
  const name = `${pkg.build.productName}.app`
  const executable = join(target, name, 'Contents/MacOS/Electron')
  try {
    await access(executable)
    return executable
  } catch {
    /* Prepare this version and icon only once. */
  }
  await mkdir(cache, { recursive: true })
  const temporary = await mkdtemp(join(cache, '.prepare-'))
  try {
    const bundle = join(temporary, name)
    await cp(source, bundle, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      verbatimSymlinks: true
    })
    const plist = join(bundle, 'Contents/Info.plist')
    for (const [key, value] of [
      ['CFBundleName', pkg.build.productName],
      ['CFBundleDisplayName', pkg.build.productName],
      ['CFBundleIdentifier', `${pkg.build.appId}.dev`]
    ])
      execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist])
    await copyFile(icon, join(bundle, 'Contents/Resources/electron.icns'))
    // Changing Info.plist/resources invalidates the copied vendor signature.
    // Preserve Electron's JIT entitlements when ad-hoc signing our dev copy.
    execFileSync(
      '/usr/bin/codesign',
      ['--force', '--sign', '-', '--preserve-metadata=entitlements,flags', bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
    await rename(temporary, target)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return executable
}

if (process.platform === 'darwin' && !environment.ELECTRON_EXEC_PATH) {
  environment.ELECTRON_EXEC_PATH = await macDevelopmentRuntime()
}
if (process.argv.includes('--prepare-only')) {
  console.log(environment.ELECTRON_EXEC_PATH ?? require('electron'))
} else {
  // Keep electron-vite's dev server, reloads and CLI options unchanged.
  const cli = join(dirname(require.resolve('electron-vite/package.json')), 'bin/electron-vite.js')
  const child = spawn(process.execPath, [cli, 'dev', ...process.argv.slice(2)], {
    cwd: root,
    env: environment,
    stdio: 'inherit'
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
}
