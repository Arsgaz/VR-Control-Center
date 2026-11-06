import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(await readFile(join(root, 'scripts/windows-tools.lock.json'), 'utf8'))
const output = join(root, 'resources/tools/win32-x64')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const manifestPath = join(output, 'bundle-manifest.json')

try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (
    manifest.archiveSha256 === lock.sha256 &&
    manifest.adbVersion === lock.adbVersion &&
    manifest.files.length >= lock.requiredFiles.length
  ) {
    for (const file of manifest.files) {
      if (hash(await readFile(join(output, 'scrcpy', file.name))) !== file.sha256)
        throw new Error('Cached tool changed')
    }
    for (const name of lock.requiredFiles)
      if (!manifest.files.some((file) => file.name === name))
        throw new Error('Incomplete tool cache')
    console.log(`Verified cached scrcpy ${lock.version} / ADB Windows distribution`)
    process.exit(0)
  }
} catch {
  /* Prepare a fresh verified distribution if absent or damaged. */
}

const temporary = await mkdtemp(join(tmpdir(), 'vrcc-win-tools-'))
try {
  const archiveIndex = process.argv.indexOf('--archive')
  let bytes
  if (archiveIndex >= 0) {
    if (!process.argv[archiveIndex + 1]) throw new Error('--archive requires a local ZIP path')
    bytes = await readFile(resolve(process.argv[archiveIndex + 1]))
  } else {
    const response = await fetch(lock.url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Official scrcpy download failed: HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (hash(bytes) !== lock.sha256)
    throw new Error('scrcpy archive SHA-256 mismatch; refusing to package tools')
  const archive = join(temporary, 'tools.zip')
  const extracted = join(temporary, 'extracted')
  await writeFile(archive, bytes)
  await mkdir(extracted)
  if (process.platform === 'win32') {
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'"
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)}`
    ])
  } else {
    execFileSync('unzip', ['-q', archive, '-d', extracted])
  }
  const source = join(extracted, lock.archiveRoot)
  for (const file of lock.requiredFiles)
    if (!(await stat(join(source, file))).isFile()) throw new Error(`Missing ${file}`)
  const files = []
  for (const name of (await readdir(source)).sort()) {
    if (!(await stat(join(source, name))).isFile())
      throw new Error('Unexpected directory in upstream Windows archive')
    const data = await readFile(join(source, name))
    files.push({ name, bytes: data.length, sha256: hash(data) })
  }
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await cp(source, join(output, 'scrcpy'), { recursive: true })
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        scrcpyVersion: lock.version,
        adbVersion: lock.adbVersion,
        source: lock.url,
        archiveSha256: lock.sha256,
        files
      },
      null,
      2
    ) + '\n'
  )
  console.log(
    `Prepared scrcpy ${lock.version}, ADB, server and all ${files.length} upstream files (${bytes.length} archive bytes)`
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
