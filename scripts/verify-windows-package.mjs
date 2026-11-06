import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(await readFile(join(root, 'scripts/windows-tools.lock.json'), 'utf8'))
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const appDirectory = resolve(process.argv[2] ?? join(root, 'dist/win-unpacked'))
const bundle = join(appDirectory, 'resources/tools/win32-x64')
const manifest = JSON.parse(await readFile(join(bundle, 'bundle-manifest.json'), 'utf8'))
if (
  manifest.archiveSha256 !== lock.sha256 ||
  manifest.scrcpyVersion !== lock.version ||
  manifest.adbVersion !== lock.adbVersion
)
  throw new Error('Wrong bundled tool version')
for (const name of lock.requiredFiles)
  if (!manifest.files.some((file) => file.name === name))
    throw new Error(`Missing ${name} in manifest`)
for (const file of manifest.files) {
  const bytes = await readFile(join(bundle, 'scrcpy', file.name))
  if (
    bytes.length !== file.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== file.sha256
  )
    throw new Error(`Packaged file changed: ${file.name}`)
}
await stat(join(appDirectory, 'VR Control Center.exe'))
await stat(join(appDirectory, 'resources/app.asar'))
await stat(join(appDirectory, 'resources/steamvr/ensure-steamvr.ps1'))
await stat(join(appDirectory, 'resources/branding/tray.png'))
await stat(join(appDirectory, 'resources/third-party/NOTICES.txt'))
await stat(join(appDirectory, 'resources/third-party/GOLOS-TEXT-OFL.txt'))
await stat(join(appDirectory, 'resources/font-licenses/GOLOS-TEXT-OFL.txt'))
await stat(join(appDirectory, 'resources/README-Windows.txt'))
const report = {
  version,
  scrcpyVersion: lock.version,
  source: lock.url,
  archiveSha256: lock.sha256,
  verifiedFiles: manifest.files.length,
  versions: {}
}
if (process.platform === 'win32') {
  const environment = {
    ...process.env,
    PATH: join(process.env.SystemRoot ?? 'C:/Windows', 'System32')
  }
  delete environment.ELECTRON_RUN_AS_NODE
  for (const [tool, argument] of [
    ['adb', 'version'],
    ['scrcpy', '--version']
  ]) {
    report.versions[tool] = execFileSync(join(bundle, 'scrcpy', `${tool}.exe`), [argument], {
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
      // Deliberately exclude any preinstalled ADB/scrcpy from PATH.
      env: {
        ...process.env,
        PATH: join(process.env.SystemRoot ?? 'C:/Windows', 'System32'),
        ADB: join(bundle, 'scrcpy/adb.exe')
      }
    }).trim()
  }
  const runtimeReport = join(root, 'dist/windows-runtime-verification.json')
  execFileSync(
    join(appDirectory, 'VR Control Center.exe'),
    ['--verify-bundled-tools', runtimeReport],
    {
      timeout: 45_000,
      windowsHide: true,
      env: environment
    }
  )
  const runtime = JSON.parse(await readFile(runtimeReport, 'utf8'))
  if (runtime.version !== version) throw new Error('Wrong packaged application version')
  for (const tool of ['adb', 'scrcpy']) {
    if (
      !runtime[tool].available ||
      runtime.resolved[tool] !== join(bundle, 'scrcpy', `${tool}.exe`)
    )
      throw new Error(`Packaged app did not resolve bundled ${tool}`)
  }
  if (runtime.resolved.server !== join(bundle, 'scrcpy', 'scrcpy-server'))
    throw new Error('Wrong scrcpy server path')
  report.runtime = runtime
}
await writeFile(
  join(root, 'dist/windows-verification.json'),
  JSON.stringify(report, null, 2) + '\n'
)
console.log(JSON.stringify(report, null, 2))
