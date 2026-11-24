import { execFileSync } from 'node:child_process'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import pkg from '../package.json' with { type: 'json' }

const root = fileURLToPath(new URL('..', import.meta.url))
const artifacts = join(root, 'artifacts')
await mkdir(artifacts, { recursive: true })
const archive = execFileSync('npm', [
  'pack', '--quiet', '--pack-destination', artifacts, '--cache', join(root, '.runtime', 'npm-cache'),
], { cwd: root, encoding: 'utf8' }).trim()

const previousVersions = await Promise.all((await readdir(artifacts))
  .filter(name => name !== archive && /^dsh-gestures-[\da-z.-]+\.tgz$/i.test(name))
  .map(async name => {
    const path = join(artifacts, name)
    return { path, updated: (await stat(path)).mtimeMs }
  }))
previousVersions.sort((a, b) => b.updated - a.updated)
for (const { path } of previousVersions.slice(3)) await rm(path)
console.log(join(artifacts, archive))
