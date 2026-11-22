// redesign R1: 概览 is gone and the app opens on a library's 待看 — the screen this file waits for is 'inbox' (was 'overview'); nothing else changed
// The tray and the timed round on the running app (docs/desktop.md §4.3). A test run makes no tray icon: the log says what it
// would show (`tray: …`). Four sessions on the seeded world:
//   on       the schedule on: the window's close button leaves the app running (the window still there, the bridge answers);
//            the tray's hint is 「流息 · n 条待看」 with the seed's count
//   off      the schedule off: the same close ends the process (the control of the one above)
//   missed   STREAMS_DEV_NOW tomorrow 09:00, the last round today (so before tomorrow's 08:30): one round at start, one
//            notification 「本次运行新增 n 条待看」 in notifications.jsonl, and a wake from sleep after it starts none
//   covered  STREAMS_DEV_NOW today 12:00 with the time 00:00: the last round (the seed's, today) is after today's slot → none
// redesign R6b-2: a test name or comment here quotes a sentence of the page as 05 has it now
// (docs/checks/2026-11-13-r6b/05-对照.md 附表一); no assertion changed for it unless a line says so.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { APP } from '../src/main/texts/app.js'
import { NOTIFY } from '../src/main/texts/notify.js'
import { worldSession } from './support/seed.mjs'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { quietCard } from './support/card-world.mjs'
// v2 package F: 今日 is the 概览 tab of a library's page now (screen 'overview', the screen the app opens on); this file's assertions are v1.0's, only the screen id changed

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check, what, timeoutMs = 60_000) => {
  const t0 = Date.now()
  while (!(await check())) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out: ${what}`)
    await sleep(200)
  }
}
const pad = n => String(n).padStart(2, '0')
/** A local time as STREAMS_DEV_NOW takes it (no zone: local), `days` from today. */
const localIso = (days, hm) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hm}:00` }
const mainLog = world => readFileSync(join(world.appData, 'logs', 'main.log'), 'utf8')
const roundLines = world => readFileSync(join(world.library, '_pipeline', 'rounds.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const notifications = world => { const f = join(world.appData, 'logs', 'notifications.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [] }
const closeWindow = s => s.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close() })
const env = world => ({ STREAMS_DEV_LIBRARY: world.library })

const on = worldSession({ kind: 'seeded', waitFor: 'inbox', settings: { schedule: { enabled: true, time: '08:30' } }, env })

test('the schedule on: the tray\'s hint carries the count; the close button leaves the app running with its window', async () => {
  const hint = APP.tray.tooltip.replace('{n}', String(on.world.seed.inbox.length))
  await until(() => mainLog(on.world).includes(`tray: (a test run: no icon) hint "${hint}"`), 'the tray line')
  const child = on.app.process()
  let ended = false
  child.once('exit', () => { ended = true })
  await closeWindow(on)
  await until(() => ended || mainLog(on.world).includes('window: closed into the tray (the schedule is on)'), 'the close into the tray')
  await sleep(1500)
  // an app that ended has nothing left for the after hook to close
  if (ended) on.app = null
  assert.equal(ended, false, 'the process still runs')
  assert.equal(child.exitCode, null)
  assert.deepEqual(await on.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.isDestroyed())), [false], 'its one window is still there')
  assert.equal((await on.page.evaluate(() => window.streams.getSchedule())).ok, true, 'the page still answers')
})

const off = worldSession({ kind: 'seeded', waitFor: 'inbox', settings: { schedule: { enabled: false, time: '08:30' } }, env })

test('control: the schedule off, the same close button ends the app', async () => {
  const child = off.app.process()
  const exited = new Promise(resolve => { if (child.exitCode !== null) resolve(child.exitCode); else child.once('exit', code => resolve(code)) })
  await closeWindow(off)
  const code = await Promise.race([exited, sleep(30_000).then(() => 'still running')])
  assert.equal(code, 0)
  // nothing left to close after the test: the app has ended
  off.app = null
})

// a feed on this machine with two items no round has seen, for the catch-up round (the seed's own sources are dead)
let feed = null
async function serveTwo() {
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`
    if (req.url === '/feed') {
      const items = [1, 2].map(n => `<item><title>catch-up item ${n}</title><link>${base}/item/${n}</link><pubDate>${new Date(Date.now() - n * 3_600_000).toUTCString()}</pubDate><description>summary ${n}</description></item>`).join('\n')
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
      res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>two</title>\n${items}\n</channel></rss>`)
      return
    }
    if (/^\/item\/\d+$/.test(req.url ?? '')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<html><body><p>A body.</p></body></html>'); return }
    res.writeHead(404); res.end('no')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/feed`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}

const missed = worldSession({
  kind: 'seeded',
  waitFor: 'inbox',
  settings: { schedule: { enabled: true, time: '08:30' }, connections: { active: 'claude-code' } },
  // 1.1 W7a: a library has a card, or it is not updated (needs-build): the catch-up is an update of its card. Its one source
  // is read for the first time, so its links are only noted (W5): nothing new, and no notification
  prepare: async world => {
    feed = await serveTwo()
    const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
    core.writeCard(world.library, { ...quietCard(), sources: [{ name: 'catch-up-feed', url: feed.url, status: '读得到' }] })
    return () => feed.close()
  },
  // an update needs a connection (1.0 ran a round without one): the development one, chosen as Claude Code
  env: world => ({ ...env(world), STREAMS_DEV_NOW: localIso(1, '09:00'), STREAMS_DEV_CONNECTION: 'fake' }),
})

test('missed: the last round before the last slot → one update at start (nothing new the first time: no notification); a wake from sleep afterwards starts none', async () => {
  const seedRound = missed.world.seed.round.id
  // (the app was started in the before hook: the catch-up may be done already)
  await until(() => roundLines(missed.world).length === 2, 'the catch-up round in rounds.jsonl')
  const rounds = roundLines(missed.world)
  assert.equal(rounds[0].id, seedRound, 'the seed\'s round first, then the one the app ran')
  assert.ok(rounds[1].startedAt.startsWith(new Date(Date.parse(localIso(1, '09:00'))).toISOString().slice(0, 13)), `the round ran on the app's clock: ${rounds[1].startedAt}`)
  assert.equal(rounds[1].kind, 'update', 'an update of the card')
  assert.match(mainLog(missed.world), /schedule: catch-up at start \(last round /)
  await sleep(1500)
  assert.equal(notifications(missed.world).length, 0, 'nothing new the first time a source is read: no notification')
  // only one: a wake from sleep looks again and finds nothing owed
  await missed.app.evaluate(({ powerMonitor }) => { powerMonitor.emit('resume') })
  await until(() => mainLog(missed.world).includes('schedule: resume: nothing missed'), 'the look after waking')
  await sleep(2000)
  assert.equal(roundLines(missed.world).length, 2, 'still two rounds')
  assert.equal(notifications(missed.world).length, 0, 'still none')
  const sched = (await missed.page.evaluate(() => window.streams.getSchedule())).data
  assert.equal(sched.missed, false)
  assert.equal(sched.lastRoundAt, rounds[1].startedAt)
})

const covered = worldSession({
  kind: 'seeded',
  waitFor: 'inbox',
  settings: { schedule: { enabled: true, time: '00:00' } },
  env: world => ({ ...env(world), STREAMS_DEV_NOW: localIso(0, '12:00') }),
})

test('covered: the last round started after today\'s slot → no round at start', async () => {
  await until(() => mainLog(covered.world).includes('schedule: start: nothing missed'), 'the look at start')
  await sleep(2000)
  assert.equal(roundLines(covered.world).length, 1, 'the seed\'s round only')
  assert.equal(notifications(covered.world).length, 0)
  const sched = (await covered.page.evaluate(() => window.streams.getSchedule())).data
  assert.deepEqual([sched.enabled, sched.time, sched.missed], [true, '00:00', false])
  assert.equal(sched.nextRunAt, new Date(Date.parse(localIso(1, '00:00'))).toISOString(), 'next: tomorrow 00:00 on the app\'s clock')
})
