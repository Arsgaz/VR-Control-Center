import { createHash } from 'node:crypto'
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
await copyFile(join(root, 'resources/windows/README-RU.txt'), join(dist, 'README-Windows.txt'))
const files = (await readdir(dist))
  .filter(
    (name) =>
      /\.(exe|zip|blockmap)$/.test(name) ||
      name.endsWith('verification.json') ||
      name === 'README-Windows.txt'
  )
  .sort()
if (
  !files.some((file) => file.endsWith('-setup.exe')) ||
  !files.some((file) => file.endsWith('.zip'))
)
  throw new Error('Missing Windows installer or ZIP')
const lines = []
for (const name of files)
  lines.push(
    `${createHash('sha256')
      .update(await readFile(join(dist, name)))
      .digest('hex')}  ${name}`
  )
await writeFile(join(dist, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
console.log(`Wrote SHA256SUMS.txt for ${files.length} Windows release files`)
