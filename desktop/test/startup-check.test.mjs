// 1.1 W1 (C2 / C3): the app checks its own files — the definition of actions and the two SOPs — before it does anything.
// Broken or missing, it says so in the app's language and ends with exit code 1 (in a test run, with the window hidden,
// it only writes the log); sound, it starts as before. A development run points the check at another folder through
// STREAMS_DEV_SOP_DIR / STREAMS_DEV_DEFINITION; the installed app always uses its own files.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR, REPO_DIR, electronExe } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makeWorld } from '../scripts/lib/world.mjs'
import { closeApp, launch, testEnv } from './support/app.mjs'
import { startupProblem } from '../src/main/startup-check.mjs'

const SOP_DIR = join(REPO_DIR, 'core', 'src', 'sop')
const base = tempDir('st-desktop-startup-')
after(() => removeTree(base, { waitMs: 10_000 }))

test('startupProblem · nothing when the check passes; otherwise the title and the problems in the app\'s language', () => {
  assert.equal(startupProblem({ check: () => ({ ok: true, problems: [] }) }), null)
  const bad = () => ({ ok: false, problems: [{ code: 'sop-missing', message: 'the build SOP is missing (x)' }] })
  const zh = startupProblem({ check: bad, language: 'zh-CN' })
  assert.equal(zh.title, '流息无法启动')
  assert.match(zh.body, /请重新安装流息/)
  assert.match(zh.body, /- the build SOP is missing \(x\)/)
  assert.ok(!zh.body.includes('{problems}'))
  const en = startupProblem({ check: bad, language: 'en' })
  assert.equal(en.title, 'Streams cannot start')
  assert.match(en.body, /Please reinstall Streams/)
  assert.equal(startupProblem({ check: bad, language: 'fr' }).title, '流息无法启动', 'an unknown language falls back to Chinese')
})

async function startBroken(name, extraEnv) {
  const run = await makeWorld({ root: join(base, name) })
  const child = spawn(electronExe(), [DESKTOP_DIR], { env: testEnv(run, { env: extraEnv }), stdio: 'ignore', windowsHide: true })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('the app did not end within 30 s')) }, 30_000)
    child.on('exit', c => { clearTimeout(timer); resolve(c) })
  })
  const logFile = join(run.appData, 'logs', 'main.log')
  return { code, log: existsSync(logFile) ? readFileSync(logFile, 'utf8') : '' }
}

test('a missing SOP: the app does not start (exit code 1) and its log says why', async () => {
  const empty = join(base, 'no-sop')
  mkdirSync(empty, { recursive: true })
  copyFileSync(join(SOP_DIR, 'update.md'), join(empty, 'update.md'))
  const r = await startBroken('world-no-sop', { STREAMS_DEV_SOP_DIR: empty })
  assert.equal(r.code, 1)
  assert.match(r.log, /startup: the core's own files are not sound, not starting: sop-missing the build SOP is missing/)
})

test('a broken definition file: the app does not start (exit code 1) and its log says why', async () => {
  const dir = join(base, 'bad-def')
  mkdirSync(dir, { recursive: true })
  const p = join(dir, 'streams.json')
  writeFileSync(p, '{ "schema": "streams.ontology/1" }')
  const r = await startBroken('world-bad-def', { STREAMS_DEV_DEFINITION: p })
  assert.equal(r.code, 1)
  assert.match(r.log, /startup: the core's own files are not sound, not starting: ontology-invalid/)
})

test('sound files in another folder: the app starts as usual (the other side of the two above)', async () => {
  const good = join(base, 'good-sop')
  mkdirSync(good, { recursive: true })
  for (const n of ['build.md', 'update.md']) copyFileSync(join(SOP_DIR, n), join(good, n))
  const run = await makeWorld({ root: join(base, 'world-good') })
  const { app, page } = await launch(run, { env: { STREAMS_DEV_SOP_DIR: good } })
  try {
    await page.waitForLoadState('domcontentloaded')
    assert.equal((await page.evaluate(() => window.streams.getAppState())).ok, true)
    assert.ok(!readFileSync(join(run.appData, 'logs', 'main.log'), 'utf8').includes('not starting'))
  } finally {
    await closeApp(app, { userDataDir: join(run.appData, 'electron') }).catch(() => {})
  }
})
