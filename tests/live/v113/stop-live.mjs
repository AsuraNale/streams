#!/usr/bin/env node
// 1.1.3, the scorecard's 「live」: on a real connection (Claude Code), in the real window, a library made here with a small
// card. In its conversation: a change starts (its first turn answered by the agent), the next words are stopped while the
// agent works — the words come back to the box and the change is still open (its question, its card as before); sent
// again, the agent goes on with the change (a new session told Streams' record). While that turn works, a new library's
// conversation is started: it waits (等待主 Agent · 第 1 位) and starts by itself once the first is done. Both are discarded
// at the end (nothing made). The app in development (desktop/), the window shown, a frame every 5 s. Spends quota.
//   node tests/live/v113/stop-live.mjs --out <folder>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = join(here, '..', '..', '..')
const DESKTOP = join(REPO, 'desktop')
const core = await import(pathToFileURL(join(REPO, 'core', 'src', 'index.mjs')).href)
const { _electron } = await import(pathToFileURL(join(DESKTOP, 'node_modules', 'playwright-core', 'index.mjs')).href)
const { appEnv, electronExe } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'paths.mjs')).href)
const { closeApp } = await import(pathToFileURL(join(DESKTOP, 'scripts', 'lib', 'close-app.mjs')).href)
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1] }
const OUT = arg('out')
if (!OUT) { console.error('usage: stop-live.mjs --out <folder>'); process.exit(2) }
mkdirSync(join(OUT, 'video'), { recursive: true })
mkdirSync(join(OUT, 'shots'), { recursive: true })

const root = join(tmpdir(), `streams-v113-live-${process.pid}-${randomBytes(3).toString('hex')}`)
const world = { appData: join(root, 'app-data'), localData: join(root, 'local-data'), libraries: join(root, 'libraries') }
for (const d of Object.values(world)) mkdirSync(d, { recursive: true })
const lib = join(world.libraries, 'node-releases')
core.createLibrary(lib, { name: 'Node.js 版本动态', language: 'zh-CN' })
core.writeCard(lib, {
  name: 'Node.js 版本动态',
  definition: { summary: '跟踪 Node.js 的新版本与长期支持版本的变化。', purpose: '决定项目什么时候升级 Node.js', scope: '对象：Node.js 运行时；行业：软件开发；地域：全球；规模：开源项目', exclude: '第三方教程', trust: '只收官方发布说明', rhythm: '每周一次', language: '中文', hard: '一手出处' },
  decide: [], collect: ['新版本发布', '长期支持版本的变化'], skip: ['教程'],
  sources: [{ name: 'Node.js 官方博客', url: 'https://nodejs.org/en/blog', status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清版本号和日期'], samples: [{ title: 'Node.js 官方博客', url: 'https://nodejs.org/en/blog', date: '2026-11-01' }],
})
writeFileSync(join(world.appData, 'settings.json'), `${JSON.stringify({ schema: 'streams.settings/1', schedule: { enabled: false, time: '08:30' }, panel: { open: true, tab: 'decide' }, theme: 'research', appearance: 'light', connections: { active: 'claude-code', 'claude-code': { model: null, verifyModel: null }, codex: { model: null, verifyModel: null }, api: { vendor: null, baseUrl: null, model: null, verifyModel: null } } })}\n`)

const record = { startedAt: new Date().toISOString(), steps: [], problems: [] }
const save = () => writeFileSync(join(OUT, 'stop-live.json'), `${JSON.stringify(record, null, 2)}\n`)
const step = (what, data = {}) => { record.steps.push({ at: new Date().toISOString(), what, ...data }); save(); console.log(what, JSON.stringify(data).slice(0, 300)) }

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  executablePath: electronExe(),
  args: ['--force-device-scale-factor=1', DESKTOP],
  env: appEnv({ appData: world.appData, localData: world.localData, extra: { STREAMS_WINDOW: 'shown', STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN', STREAMS_DEV_UPDATE_URL: 'off', STREAMS_DEV_LIBRARY: lib, STREAMS_DEV_LIBRARY_ROOT: world.libraries, STREAMS_START_SCREEN: 'inbox' } }),
  timeout: 60_000,
})
const page = await app.firstWindow({ timeout: 60_000 })
const mask = () => [page.locator('.st-path'), page.getByText(/AppData|[A-Z]:\\Users/)]
let frameNo = 0
const frames = setInterval(() => { frameNo += 1; page.screenshot({ path: join(OUT, 'video', `v113-${String(frameNo).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 55, mask: mask() }).catch(() => {}) }, 5000)
const until = (fn, a, timeout = 15 * 60_000) => page.waitForFunction(fn, a, { polling: 500, timeout })
const shot = name => page.screenshot({ path: join(OUT, 'shots', `${name}.png`), mask: mask() }).catch(() => {})
const state = () => page.evaluate(() => ({
  main: document.querySelector('main[data-screen="build"]')?.dataset ?? null,
  box: document.querySelector('textarea[data-field="message"]')?.value ?? null,
  gaveBack: document.querySelector('[data-part="gave-back"]')?.textContent ?? null,
  rows: [...document.querySelectorAll('nav[data-part="conversations"] [data-conv]')].map(r => ({ id: r.dataset.conv, state: r.dataset.state, line: r.querySelector('[data-part="conv-line"]')?.textContent })),
  turns: [...document.querySelectorAll('[data-part="conversation"] [data-row]')].map(t => `${t.dataset.row}${t.dataset.kind ? `/${t.dataset.kind}` : ''}: ${t.textContent.slice(0, 160)}`),
}))
const settled = () => until(() => { const m = document.querySelector('main[data-screen="build"]'); return m && !['working', 'waiting'].includes(m.dataset.convState) })
// an answer to what the agent asked: a choice gets its first option, a question with no options gets words
async function answer(words) {
  const choice = await page.evaluate(() => Boolean(document.querySelector('[data-part="question"][data-open="true"] li[data-option]')))
  if (choice) { await page.click('[data-part="question"][data-open="true"] li[data-option]'); await page.click('[data-part="question"][data-open="true"] [data-action="answer"] button'); return 'choice' }
  await page.fill('textarea[data-field="message"]', words)
  await page.click('[data-action="send"] button')
  return 'words'
}

try {
  await until(() => document.querySelector('main[data-screen="inbox"]') !== null, null, 90_000)
  await page.click('.st-sidebar [data-nav="chat"]')
  await until(() => document.querySelector('nav[data-part="conversations"] [data-conv^="lib:"]') !== null, null, 60_000)
  const conv = await page.evaluate(() => document.querySelector('nav[data-part="conversations"] [data-conv^="lib:"]').dataset.conv)
  await page.click(`nav[data-part="conversations"] [data-conv="${conv}"] .st-conv__main`)
  await until(a => document.querySelector(`main[data-screen="build"][data-conv="${a}"]`) !== null, conv, 60_000)
  step('the library\'s conversation', { conv })
  await page.fill('textarea[data-field="message"]', '我想多跟踪一点长期支持版本什么时候结束维护的消息。')
  await page.click('[data-action="send"] button')
  await until(() => document.querySelector('main[data-screen="build"][data-conv-state="working"]') !== null, null, 60_000)
  await settled()
  const first = await state()
  step('the first turn of the change', { state: first.main?.convState, turns: first.turns })
  await shot('01-first-turn')
  // the next words, stopped while the agent works
  const how = await answer('主要关心哪些版本快要结束维护、什么时候结束。')
  await until(() => document.querySelector('[data-action="stop-turn"] button') !== null, null, 60_000)
  await page.waitForTimeout(20_000)
  const working = await state()
  step('working, about to stop', { how, state: working.main?.convState, rows: working.rows })
  await shot('02-working')
  const t0 = Date.now()
  await page.click('[data-action="stop-turn"] button')
  await until(() => document.querySelector('[data-part="gave-back"]') !== null, null, 60_000)
  const stopped = await state()
  step('stopped', { tookMs: Date.now() - t0, state: stopped.main?.convState, box: stopped.box, gaveBack: stopped.gaveBack, turns: stopped.turns, sameTurnsAsBefore: JSON.stringify(stopped.turns) === JSON.stringify(first.turns) })
  if (JSON.stringify(stopped.turns) !== JSON.stringify(first.turns)) record.problems.push('the turns after the stop are not the ones before the words')
  if (how === 'words' && !stopped.box) record.problems.push('the words did not come back to the box')
  await shot('03-stopped')
  // sent again — and meanwhile a new library's conversation, which has to wait
  if (how === 'choice') { await page.click('[data-part="question"][data-open="true"] li[data-option]'); await page.click('[data-part="question"][data-open="true"] [data-action="answer"] button') } else await page.click('[data-action="send"] button')
  await until(() => document.querySelector('main[data-screen="build"][data-conv-state="working"]') !== null, null, 60_000)
  await page.click('nav[data-part="conversations"] [data-action="conv-new"] button')
  await until(() => document.querySelector('main[data-screen="build"][data-view="start"]') !== null, null, 30_000)
  await page.fill('textarea[data-field="opener"]', '帮我跟踪 Rust 语言的新版本发布。')
  await page.click('[data-action="start"] button')
  await until(() => document.querySelector('main[data-screen="build"][data-kind="unbuilt"]') !== null, null, 60_000)
  const waiting = await state()
  step('a new library\'s conversation while the change works', { state: waiting.main?.convState, rows: waiting.rows })
  if (waiting.main?.convState !== 'waiting') record.problems.push(`the new conversation did not wait (${waiting.main?.convState})`)
  await shot('04-waiting')
  await until(() => { const m = document.querySelector('main[data-screen="build"]'); return m && m.dataset.convState === 'working' }, null, 15 * 60_000)
  step('the new one started by itself', { rows: (await state()).rows })
  await shot('05-started-by-itself')
  await settled()
  step('the new one answered', { state: (await state()).main?.convState, turns: (await state()).turns })
  await page.click(`nav[data-part="conversations"] [data-conv="${conv}"] .st-conv__main`)
  await until(a => document.querySelector(`main[data-screen="build"][data-conv="${a}"]`) !== null, conv, 60_000)
  await settled()
  const after = await state()
  step('the change, sent again after the stop', { state: after.main?.convState, turns: after.turns })
  await shot('06-change-went-on')
  // nothing made: both discarded
  const rows = (await state()).rows
  for (const r of rows.filter(x => x.state !== 'idle' && x.state !== 'none')) {
    await page.evaluate(id => window.streams.dropBuild(id), r.id).catch(e => record.problems.push(`drop ${r.id}: ${e.message}`))
  }
  step('discarded', { rows: (await state()).rows, built: readdirSync(join(world.appData, 'build')).filter(n => n.startsWith('ended-')) })
} catch (err) {
  record.problems.push(String(err?.stack ?? err))
  await shot('99-failed')
} finally {
  clearInterval(frames)
  const log = join(world.appData, 'logs', 'main.log')
  if (existsSync(log)) writeFileSync(join(OUT, 'main.log'), readFileSync(log, 'utf8').replace(/[A-Z]:\\Users\\[^\\\s"]+/g, '<home>'))
  record.endedAt = new Date().toISOString()
  save()
  await closeApp(app, { userDataDir: join(world.appData, 'electron') }).catch(() => {})
}
