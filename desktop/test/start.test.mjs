// D10: the development folder of `npm start` is only ever emptied or filled when these scripts
// made it (their marker file, scripts/lib/dev-root.mjs): any other folder that exists and holds something is refused
// and left exactly as it was — whatever --root names, --fresh included; nothing outside the OS temp folder.
// Runs the scripts as a user would, with --prepare-only (no window).
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKER } from '../scripts/lib/dev-root.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { worldOf } from '../scripts/lib/world.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const base = tempDir('st-desktop-start-')
after(() => removeTree(base, { waitMs: 10_000 }))
const run = (script, ...args) => spawnSync(process.execPath, [join(DESKTOP_DIR, 'scripts', script), ...args], { cwd: DESKTOP_DIR, encoding: 'utf8' })

test('D10 · a folder these scripts did not make is refused and left as it was (--fresh too)', () => {
  const theirs = join(base, 'someone-else')
  mkdirSync(theirs)
  writeFileSync(join(theirs, 'notes.txt'), 'keep me')
  for (const args of [['start.mjs', '--root', theirs, '--prepare-only'], ['start.mjs', '--root', theirs, '--fresh', '--prepare-only']]) {
    const r = run(...args)
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`)
    assert.match(r.stderr, /refusing/)
  }
  assert.deepEqual(readdirSync(theirs), ['notes.txt'])
  assert.equal(readFileSync(join(theirs, 'notes.txt'), 'utf8'), 'keep me')
})

test('D10 · a folder outside the OS temp folder is refused, before anything is made', () => {
  // On a drive this machine does not have: the check reads only the path's text, so it is the same for any folder
  // outside the temp folder — and were it gone, nothing could be written there (making the folder fails instead of
  // being refused). Not under desktop/: a copy of desktop/ (the mutants) is under the temp folder.
  const free = [...'ZYXWVUTSRQPONMLKJI'].find(letter => !existsSync(`${letter}:/`))
  assert.ok(free, 'a drive letter this machine does not use')
  const r = run('start.mjs', '--root', join(`${free}:/`, 'streams-desktop-not-temp'), '--prepare-only')
  assert.equal(r.status, 2, `${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /refusing .*: development folders go under the OS temp folder/)
})

test('D10 · a new folder is made and marked, used again as it is, and made again with --fresh', () => {
  const ours = join(base, 'dev')
  let r = run('start.mjs', '--root', ours, '--prepare-only')
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.ok(existsSync(join(ours, MARKER)) && worldOf(ours)?.kind === 'empty', 'marked, with the world')
  writeFileSync(join(ours, 'left-by-a-run.txt'), 'x')
  r = run('start.mjs', '--root', ours, '--prepare-only')
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.ok(existsSync(join(ours, 'left-by-a-run.txt')), 'used as it is')
  r = run('start.mjs', '--root', ours, '--fresh', '--prepare-only')
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.equal(existsSync(join(ours, 'left-by-a-run.txt')), false, 'made again')
  assert.ok(existsSync(join(ours, MARKER)) && worldOf(ours)?.kind === 'empty')
})

test('npm start asks GitHub nothing about updates unless --update is given; --library opens the world\'s library', () => {
  let r = run('start.mjs', '--root', join(base, 'dev-update'), '--prepare-only')
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /^update: off$/m)
  assert.match(r.stdout, /^library: \(none open\)$/m)
  r = run('start.mjs', '--root', join(base, 'dev-update-on'), '--update', '--library', '--prepare-only')
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /^update: GitHub$/m)
  assert.match(r.stdout, /^library: .*dev-update-on[\\/]world[\\/]library$/m)
})
