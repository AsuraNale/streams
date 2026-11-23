#!/usr/bin/env node
// 1.1 W7a (acceptance E3): makes test/fixtures/v101-library — a library as 1.0.1 left it, made once with 1.0's own round
// (test/support/seed.mjs seedLibrary: a feed on this machine, the scripted connector; since W7b that round is core/legacy's,
// which the product does not ship). Three items kept (one by the seed round, two here: notes/), two left in 待看. The folder is committed; the tests copy it, never change it.
//   node scripts/make-v101-fixture.mjs        writes the folder again (it must not exist)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { DESKTOP_DIR } from './lib/paths.mjs'
import { seedLibrary } from '../test/support/seed.mjs'
import * as core from '../src/main/core.mjs'

const OUT = join(DESKTOP_DIR, 'test', 'fixtures', 'v101-library')
if (existsSync(OUT)) { console.error(`${OUT} is there already`); process.exit(2) }
const work = join(tmpdir(), `st-v101-${randomBytes(4).toString('hex')}`)
const dir = join(work, 'v101-library')
mkdirSync(dir, { recursive: true })
await seedLibrary(dir, { now: () => new Date('2026-11-10T09:00:00Z') })
const inbox = core.listInbox(dir)
if (inbox.length !== 4) throw new Error(`the round put ${inbox.length} items in 待看; 4 were expected`)
for (const item of inbox.slice(0, 2)) core.keep(dir, item.url, { now: () => new Date('2026-11-11T09:00:00Z') })
const notes = readdirSync(join(dir, 'notes')).filter(n => n.endsWith('.md'))
console.log(`notes ${notes.length} · inbox ${core.listInbox(dir).length}`)
if (notes.length !== 3 || core.listInbox(dir).length !== 2) throw new Error('not 3 notes and 2 in 待看')
// nothing of this machine in the files (a path, the user's name)
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
for (const f of walk(dir)) {
  const t = readFileSync(f, 'utf8')
  if (t.includes(work) || /[A-Za-z]:\\Users\\/.test(t)) throw new Error(`${relative(dir, f)} names this machine`)
}
cpSync(dir, OUT, { recursive: true })
console.log(`written: ${OUT}`)
