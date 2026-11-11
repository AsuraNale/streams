#!/usr/bin/env node
// UX handoff 11-10 (docs/checks/2026-11-10-ux-handoff/contract.md): the driver for the case flow of the UX redesign handoff.
// It starts the app from this repository (the pinned Electron, the window shown, --force-device-scale-factor=1) on a world
// of its own and then waits for steps: a small HTTP server on 127.0.0.1 takes one step at a time (a piece of JavaScript run
// with the Playwright page and app in scope), so a step can look at what the real connection answered before the next one.
// Every step is appended to the step log (--log), so the run can be read back and done again.
//   node scripts/shots-handoff.mjs --world <dir> --port <n> --out <shots dir> --log <steps.jsonl>
//        [--env <file.json>]        more environment for the app (e.g. STREAMS_DEV_CHOOSE_FOLDER, STREAMS_DEV_CONNECTION)
//        [--settings <file.json>]   the settings.json to start with — only when the world has none yet
//        [--site <dir> --site-port <n>]   a small web site on this machine for the feeds and the article pages:
//                                   files under <dir>; any path under /hang/ never answers (a feed that keeps a round in 抓取)
// The world (made when missing): <world>/app-data, local-data, tmp (the app's TEMP / TMP: the main Agent's working folder
// and the connectors' empty working folders are made there with mkdirSync, not in the system's), libs (new libraries'
// default place, STREAMS_DEV_LIBRARY_ROOT), pick (folders the 「选文件夹」 dialog answers with). The world is kept: it is
// the record of the run. It refuses a world inside the real %APPDATA%\Streams, %LOCALAPPDATA%\Streams, the installed app's
// folder or Documents, and it never reads or writes any of them.
// Steps: POST /step  body {"name": "...", "code": "..."}  → {"ok":true,"value":…} | {"ok":false,"error":"…"}
//   in scope: page, app, ctx — ctx.shot(name), ctx.readerShot(name), ctx.count(), ctx.until(fn, arg, ms), ctx.sleep(ms),
//   ctx.ready(screen), ctx.click(selector), ctx.fill(selector, text), ctx.errors, ctx.mem (kept between steps)
//   POST /quit closes the app and ends the driver.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { _electron } from 'playwright-core'
import { closeApp } from './lib/close-app.mjs'
import { DESKTOP_DIR, appEnv, electronExe } from './lib/paths.mjs'

const args = process.argv.slice(2)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const need = name => { const v = value(name); if (!v) throw new Error(`missing ${name}`); return resolve(v) }
const WORLD = need('--world')
const OUT = need('--out')
const LOG = need('--log')
const PORT = Number(value('--port') ?? 47900)
const SITE = value('--site') ? resolve(value('--site')) : null
const SITE_PORT = Number(value('--site-port') ?? 47831)

// ---- never the real data ----
const inside = (child, parent) => { const r = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase()); return r === '' || (!r.startsWith('..') && !isAbsolute(r)) }
const forbidden = [
  process.env.APPDATA && join(process.env.APPDATA, 'Streams'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Streams'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Streams'),
  process.env.USERPROFILE && join(process.env.USERPROFILE, 'Documents'),
].filter(Boolean)
for (const f of forbidden) {
  if (inside(WORLD, f) || inside(OUT, f)) throw new Error(`refusing: ${WORLD} / ${OUT} is inside ${f}`)
}

const dirs = { appData: join(WORLD, 'app-data'), localData: join(WORLD, 'local-data'), tmp: join(WORLD, 'tmp'), libs: join(WORLD, 'libs'), pick: join(WORLD, 'pick') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
mkdirSync(OUT, { recursive: true })
const settingsFile = join(dirs.appData, 'settings.json')
if (value('--settings') && !existsSync(settingsFile)) writeFileSync(settingsFile, readFileSync(resolve(value('--settings')), 'utf8'))
const extraEnv = value('--env') ? JSON.parse(readFileSync(resolve(value('--env')), 'utf8')) : {}

const log = entry => appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)

// ---- the web site on this machine (feeds and article pages) ----
let site = null
if (SITE) {
  const TYPES = { '.xml': 'application/rss+xml; charset=utf-8', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' }
  const hanging = new Set()
  site = createServer((req, res) => {
    const u = new URL(req.url ?? '/', `http://127.0.0.1:${SITE_PORT}`)
    log({ site: req.method, path: u.pathname })
    if (u.pathname.startsWith('/hang/')) { hanging.add(res); res.on('close', () => hanging.delete(res)); return }
    const file = join(SITE, ...u.pathname.split('/').filter(Boolean).map(decodeURIComponent))
    if (!inside(file, SITE) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not here'); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  site.hanging = hanging
  await new Promise((ok, bad) => { site.once('error', bad); site.listen(SITE_PORT, '127.0.0.1', ok) })
}

// ---- the app ----
const env = appEnv({
  appData: dirs.appData,
  localData: dirs.localData,
  extra: {
    STREAMS_WINDOW: 'shown',
    STREAMS_DEV_SYSTEM_LANGUAGES: 'zh-CN',
    STREAMS_DEV_UPDATE_URL: 'off',
    STREAMS_DEV_LIBRARY: '',
    STREAMS_DEV_LIBRARY_ROOT: dirs.libs,
    TEMP: dirs.tmp,
    TMP: dirs.tmp,
    ...extraEnv,
  },
})
const app = await _electron.launch({ executablePath: electronExe(), args: ['--force-device-scale-factor=1', DESKTOP_DIR], env, timeout: 60_000 })
const page = await app.firstWindow({ timeout: 60_000 })
const errors = []
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })
log({ started: true, world: WORLD, env: Object.fromEntries(Object.entries(extraEnv)) })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const FONT_CHECK = "document.fonts.check('14px \"Streams Noto Sans SC\"')"

// what can be clicked on the page: rendered (a box, not hidden), counted once each; by kind and by region
const COUNT = () => {
  const SEL = 'button, a[href], input:not([type=hidden]), textarea, select, summary, [role=tab], [role=menuitem], [role=menuitemradio], [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=option], [contenteditable=true]'
  const seen = new Set()
  const rows = []
  for (const el of document.querySelectorAll(SEL)) {
    if (seen.has(el)) continue
    // a control inside another control (an <input> in a <label role=radio>) is one thing to click
    const outer = el.parentElement?.closest(SEL)
    if (outer && outer.contains(el) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(outer.tagName)) continue
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none' || el.closest('[hidden],[aria-hidden="true"]')) continue
    seen.add(el)
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role')
    const kind = role === 'tab' ? 'tab' : role?.startsWith('menuitem') ? 'menuitem' : ['input', 'textarea', 'select'].includes(tag) || role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'option' ? 'input' : tag === 'a' || role === 'link' ? 'link' : 'button'
    const region = el.closest('dialog,[role=dialog],[data-dialog]') ? 'dialog' : el.closest('[data-part="right-panel"]') ? 'right-panel' : el.closest('aside.st-sidebar') ? 'sidebar' : el.closest('.st-lib-tabs,[data-part="library-head"]') ? 'library-head' : 'main'
    rows.push({ kind, region, disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true', text: (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 40) })
  }
  const by = key => rows.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] ?? 0) + 1 }), {})
  return { total: rows.length, enabled: rows.filter(r => !r.disabled).length, byKind: by('kind'), byRegion: by('region'), screen: document.querySelector('main[data-screen]')?.dataset.screen ?? null, items: rows }
}

const ctx = {
  errors,
  mem: {},
  dirs,
  site,
  sleep,
  async until(fn, arg, ms = 60_000) { return page.waitForFunction(fn, arg, { polling: 150, timeout: ms }) },
  async ready(screen) { await page.waitForFunction(id => Boolean(document.querySelector(`main[data-screen="${id}"][data-state="ready"]`)), screen, { timeout: 90_000, polling: 150 }) },
  async click(selector) { await page.click(selector, { timeout: 20_000 }) },
  async fill(selector, text) { await page.fill(selector, text, { timeout: 20_000 }) },
  async count() { return page.evaluate(COUNT) },
  async shot(name, { blur = true } = {}) {
    if (blur) await page.evaluate(() => document.activeElement?.blur?.())
    await page.evaluate(() => document.fonts.ready)
    await sleep(450)
    const font = await page.evaluate(FONT_CHECK)
    const file = join(OUT, `${name}.png`)
    for (let i = 0; ; i++) {
      try { await page.screenshot({ path: file, timeout: 20_000 }); break } catch (err) {
        if (i === 2) throw err
        await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus() })
        await sleep(500)
      }
    }
    const size = await page.evaluate(() => [innerWidth, innerHeight])
    const counted = await page.evaluate(COUNT)
    const entry = { shot: name, file, size, font, screen: counted.screen, clickable: { total: counted.total, enabled: counted.enabled, byKind: counted.byKind, byRegion: counted.byRegion } }
    log(entry)
    return entry
  },
  // the reading window: its bar and its page, taken by Electron and laid one above the other (as scripts/screenshot.mjs)
  async readerShot(name) {
    const shot = await app.evaluate(async ({ BrowserWindow, nativeImage, session }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === session.fromPartition('streams-reader'))
      if (!win) return null
      const view = win.contentView.children[0]
      const bar = await win.webContents.capturePage()
      const body = await view.webContents.capturePage()
      const top = view.getBounds().y
      const a = bar.getSize()
      const b = body.getSize()
      const width = Math.min(a.width, b.width)
      const rows = []
      for (const [img, size, height] of [[bar, a, top], [body, b, b.height]]) {
        const bmp = img.toBitmap()
        for (let y = 0; y < height; y++) rows.push(bmp.subarray(y * size.width * 4, y * size.width * 4 + width * 4))
      }
      const out = nativeImage.createFromBitmap(Buffer.concat(rows), { width, height: top + b.height })
      return { png: out.toPNG().toString('base64'), size: [width, top + b.height], title: win.getTitle(), content: win.getContentSize() }
    })
    if (!shot) throw new Error('no reading window')
    const file = join(OUT, `${name}.png`)
    writeFileSync(file, Buffer.from(shot.png, 'base64'))
    const entry = { shot: name, file, size: shot.size, window: 'reader', title: shot.title, content: shot.content }
    log(entry)
    return entry
  },
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
let quitting = false
const control = createServer((req, res) => {
  let body = ''
  req.on('data', d => { body += d })
  req.on('end', async () => {
    const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj, null, 1)) }
    if (req.url === '/quit') {
      quitting = true
      reply(200, { ok: true, errors })
      log({ quit: true, errors })
      try { await closeApp(app, { userDataDir: join(dirs.appData, 'electron') }) } catch { /* reported below */ }
      if (site) { for (const r of site.hanging) r.destroy(); site.close() }
      control.close()
      return
    }
    if (req.url !== '/step') { reply(404, { ok: false, error: 'POST /step or /quit' }); return }
    let step
    try { step = JSON.parse(body) } catch { reply(400, { ok: false, error: 'body is not JSON' }); return }
    const started = Date.now()
    try {
      const value = await new AsyncFunction('page', 'app', 'ctx', step.code)(page, app, ctx)
      log({ step: step.name ?? null, code: step.code, ok: true, ms: Date.now() - started, value })
      reply(200, { ok: true, value, errors: errors.splice(0) })
    } catch (err) {
      log({ step: step.name ?? null, code: step.code, ok: false, ms: Date.now() - started, error: String(err?.message ?? err) })
      reply(200, { ok: false, error: String(err?.stack ?? err), errors: errors.splice(0) })
    }
  })
})
await new Promise(r => control.listen(PORT, '127.0.0.1', r))
app.process().once('exit', () => { if (!quitting) { log({ appExited: true }); control.close(); if (site) site.close() } })
process.stdout.write(`ready on http://127.0.0.1:${PORT} (world ${WORLD})\n`)
