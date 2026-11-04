// The build's checks on the stage (installer/stage-check.mjs, installer/scan.mjs), run on copies of the real stage
// (installer/dist/stage, so after a build): the copy as built passes; each spoilt copy is caught —
//   · a file of the core that the app imports deleted (what "the core was not packed" looks like): an unresolved import
//   · the whole core missing: a missing root
//   · a test file, a fixtures folder, a development script added: development leftovers
//   · a link added: linksIn
//   · a file carrying this machine's user folder, an API key, the committing address: the scan's hits
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { developmentLeftovers, linksIn, relativeImportProblems } from '../stage-check.mjs'
import { machineMarkers, scanForLeaks } from '../scan.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STAGE = join(REPO, 'installer', 'dist', 'stage')
const { removeTree } = await import(pathToFileURL(join(REPO, 'desktop', 'scripts', 'lib', 'remove-tree.mjs')).href)
const { tempDir } = await import(pathToFileURL(join(REPO, 'desktop', 'scripts', 'lib', 'temp.mjs')).href)
const { DEV_ONLY } = await import(pathToFileURL(join(REPO, 'desktop', 'src', 'main', 'protocol.mjs')).href)
const ROOT = tempDir('st-stage-check-')
after(() => removeTree(ROOT, { waitMs: 10_000 }))

/** A copy of the stage's own code (resources/app without node_modules, resources/core): what the checks read. */
function copyOfStage(name) {
  const dest = join(ROOT, name)
  for (const part of [['resources', 'app', 'src'], ['resources', 'app', 'package.json'], ['resources', 'core']]) {
    cpSync(join(STAGE, ...part), join(dest, ...part), { recursive: true })
  }
  return dest
}

test('the stage as built passes: every relative import resolves, no leftovers, no link', () => {
  assert.ok(existsSync(join(STAGE, 'resources', 'core', 'src', 'index.mjs')), `no stage with the core at ${STAGE}: run node installer/build-installer.mjs`)
  const r = relativeImportProblems(STAGE, { devOnly: DEV_ONLY })
  assert.deepEqual({ unresolved: r.unresolved, missingRoots: r.missingRoots }, { unresolved: [], missingRoots: [] })
  assert.ok(r.imports > 100 && r.files > 100, `control: the check read our code (${r.imports} imports in ${r.files} files)`)
  assert.deepEqual(developmentLeftovers(STAGE), [])
  assert.deepEqual(linksIn(STAGE), [])
  const copy = copyOfStage('as-built')
  assert.deepEqual(relativeImportProblems(copy, { devOnly: DEV_ONLY }).unresolved, [], 'the copy passes as the stage does')
})

test('a file of the core the app imports, deleted from a copy: the import check names it', () => {
  const copy = copyOfStage('core-file-gone')
  rmSync(join(copy, 'resources', 'core', 'src', 'errors.mjs'))
  const r = relativeImportProblems(copy, { devOnly: DEV_ONLY })
  assert.ok(r.unresolved.length >= 1, 'caught')
  assert.ok(r.unresolved.every(u => u.includes('errors.mjs')), r.unresolved.join('\n'))
  assert.ok(r.unresolved.some(u => u.startsWith('resources/core/src/')), 'the core\'s own imports of it')
})

test('the whole core missing from a copy: a missing root, and desktop\'s import of the core unresolved', () => {
  const copy = copyOfStage('no-core')
  rmSync(join(copy, 'resources', 'core'), { recursive: true })
  const r = relativeImportProblems(copy, { devOnly: DEV_ONLY })
  assert.deepEqual(r.missingRoots, ['resources/core/src'])
  assert.ok(r.unresolved.includes('resources/app/src/main/core.mjs → ../../../core/src/index.mjs'), r.unresolved.join('\n'))
})

test('a test file, a fixtures folder, a development script in a copy: development leftovers', () => {
  const copy = copyOfStage('leftovers')
  writeFileSync(join(copy, 'resources', 'core', 'src', 'index.test.mjs'), '// a test\n')
  mkdirSync(join(copy, 'resources', 'app', 'src', 'fixtures'))
  writeFileSync(join(copy, 'resources', 'app', 'src', 'fixtures', 'a.json'), '{}\n')
  mkdirSync(join(copy, 'resources', 'app', 'scripts'))
  writeFileSync(join(copy, 'resources', 'app', 'scripts', 'start.mjs'), '// dev\n')
  assert.deepEqual(developmentLeftovers(copy).sort(), ['resources/app/scripts', 'resources/app/src/fixtures', 'resources/core/src/index.test.mjs'])
})

test('a link in a copy: linksIn names it', () => {
  const copy = copyOfStage('link')
  symlinkSync(join(copy, 'resources', 'core'), join(copy, 'resources', 'core-link'), 'junction')
  assert.deepEqual(linksIn(copy), [join('resources', 'core-link')])
})

test('the scan on a copy: clean as built; this machine\'s user folder, an API key and the committing address are found', () => {
  const markers = machineMarkers()
  assert.ok(markers.emails.length >= 1, 'control: git names a committing address')
  const copy = copyOfStage('scan')
  assert.deepEqual(scanForLeaks([copy], { markers }).hits, [], 'the copy as built')
  writeFileSync(join(copy, 'resources', 'app', 'src', 'main', 'leak-path.mjs'), `export const where = ${JSON.stringify(join(homedir(), 'Documents'))}\n`)
  writeFileSync(join(copy, 'resources', 'core', 'src', 'leak-key.mjs'), `export const k = 'sk-${'0123456789abcdef'.repeat(2)}'\n`)
  writeFileSync(join(copy, 'resources', 'core', 'src', 'leak-mail.mjs'), `// ${markers.emails[0]}\n`)
  const kinds = scanForLeaks([copy], { markers }).hits.map(h => `${h.kind} ${h.file.split(/[\\/]/).pop()}`).sort()
  assert.ok(kinds.includes('machine leak-path.mjs'), kinds.join(', '))
  assert.ok(kinds.includes('key leak-key.mjs'), kinds.join(', '))
  assert.ok(kinds.includes('email leak-mail.mjs'), kinds.join(', '))
  assert.equal(readFileSync(join(STAGE, 'resources', 'core', 'src', 'index.mjs'), 'utf8').length > 0, true, 'the real stage was not touched')
})
