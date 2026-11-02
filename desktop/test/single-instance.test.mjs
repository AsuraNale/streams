// A1-6 · one app at a time: a second launch on the same data ends at once (exit code 0, no second window) and the first
// one brings its window to the front (its log says so; in a test run the window stays hidden).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR, electronExe } from '../scripts/lib/paths.mjs'
import { appSession, testEnv } from './support/app.mjs'

const s = appSession()

test('A1-6 · a second launch hands over to the first and ends; the first shows its window', async () => {
  const t0 = Date.now()
  const second = spawn(electronExe(), [DESKTOP_DIR], { env: testEnv(s.run), stdio: 'ignore', windowsHide: true })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { second.kill(); reject(new Error('the second launch did not end within 30 s')) }, 30_000)
    second.on('exit', c => { clearTimeout(timer); resolve(c) })
  })
  assert.equal(code, 0)
  assert.ok(Date.now() - t0 < 30_000)
  const log = () => readFileSync(join(s.run.appData, 'logs', 'main.log'), 'utf8')
  const deadline = Date.now() + 10_000
  while (!log().includes('second launch: the window is brought to the front') && Date.now() < deadline) await new Promise(r => setTimeout(r, 200))
  assert.match(log(), /a second launch: the app already runs, so this one ends/)
  assert.match(log(), /second launch: the window is brought to the front/)
  // the first one still answers, with its one window
  assert.equal((await s.page.evaluate(() => window.streams.getAppState())).ok, true)
  assert.equal(await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
})
