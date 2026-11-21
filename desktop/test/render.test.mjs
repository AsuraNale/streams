// 1.1 W2 (B5): the second and third ways of reading a page, for real — a hidden Electron window (src/main/render.mjs) and
// the PDF reader (src/main/pdf-text.mjs, unpdf) behind the core's page reader, on a server on 127.0.0.1:
//   /script        the text is written by the page's own script after it loads: the direct GET finds no article
//   /refused       403 to a request that is not a browser opening a page (sec-fetch-dest: document), the page to a browser
//   /report.pdf    a real PDF (made by test/support/pdf.mjs)
//   /refused-all   403 to everyone: every way fails, so it is refused
//   /captcha       a human check: stopped at once, never rendered
//   /popup         (to a browser only) an article whose script opens a window: refused, the article read. (A file: frame
//                  from an http page Chromium refuses by itself, before the session's own filter sees it: the session's
//                  refusal of file: is checked on its handler below.)
// The app that runs them is test/support/render-app (no window is ever shown).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR, electronExe } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'
import { makePdf } from './support/pdf.mjs'
import { pdfText } from '../src/main/pdf-text.mjs'
import { RENDER_WEB_PREFERENCES, guardRenderContents, hardenRenderSession } from '../src/main/render.mjs'

const words = (topic, n) => Array.from({ length: n }, (_, i) => `${topic}, part ${i + 1}: the paragraph says enough to be read as a real article by a person.`)
const SCRIPT_PAGE = `<!doctype html><html><head><title>Release notes</title></head><body><div id="app">Loading…</div><script>
  setTimeout(() => { document.getElementById('app').innerHTML = '<article>' + ${JSON.stringify(words('Version 4 adds offline mode', 4))}.map(p => '<p>' + p + '</p>').join('') + '</article>' }, 150)
</script></body></html>`
const ARTICLE = `<!doctype html><html><head><title>Council budget</title></head><body><article>${words('The council approved the budget', 4).map(p => `<p>${p}</p>`).join('')}</article></body></html>`
const CAPTCHA = '<!doctype html><html><head><title>Just a moment...</title></head><body><div class="cf-challenge">Checking your browser before accessing the site.</div></body></html>'
const POPUP = `<!doctype html><html><head><title>Popup page</title></head><body><article>${words('A page that tries to open things', 4).map(p => `<p>${p}</p>`).join('')}</article><script>
  window.open('http://127.0.0.1:1/elsewhere')
</script></body></html>`
const PDF = makePdf([['Annual report 2026.', 'Revenue rose by 12 percent to 4.1 million dollars, driven by new subscriptions', 'and lower costs across all three regions of the company this year.'], ['The board proposes a dividend of 0.30 dollars per share.']])

let server
let base
const hits = []
const root = tempDir('st-desktop-render-')
after(() => { server?.close(); removeTree(root, { waitMs: 10_000 }) })

before(async () => {
  server = createServer((req, res) => {
    // a browser opening a page says so (sec-fetch-dest: document); a fetch, Electron's main process's included, does not
    const browser = req.headers['sec-fetch-dest'] === 'document'
    hits.push({ path: req.url, ua: req.headers['user-agent'], browser })
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body) }
    if (req.url === '/script') return send(200, 'text/html; charset=utf-8', SCRIPT_PAGE)
    if (req.url === '/refused') return browser ? send(200, 'text/html; charset=utf-8', ARTICLE) : send(403, 'text/html', '<html><body>Forbidden</body></html>')
    if (req.url === '/report.pdf') return send(200, 'application/pdf', PDF)
    if (req.url === '/refused-all') return send(403, 'text/html', '<html><body>Forbidden</body></html>')
    if (req.url === '/captcha') return send(200, 'text/html', CAPTCHA)
    if (req.url === '/popup') return browser ? send(200, 'text/html; charset=utf-8', POPUP) : send(403, 'text/html', 'Forbidden')
    send(404, 'text/plain', 'no')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

async function runApp(paths) {
  const out = join(root, `out-${Date.now()}.json`)
  mkdirSync(root, { recursive: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE // set at all (even empty), Electron runs as plain Node
  const child = spawn(electronExe(), [join(DESKTOP_DIR, 'test', 'support', 'render-app')], {
    env: { ...env, STREAMS_RENDER_TEST_URLS: JSON.stringify(paths.map(p => `${base}${p}`)), STREAMS_RENDER_TEST_OUT: out },
    stdio: 'ignore', windowsHide: true,
  })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('the render app did not end within 120 s')) }, 120_000)
    child.on('exit', c => { clearTimeout(timer); resolve(c) })
  })
  assert.equal(code, 0)
  assert.ok(existsSync(out), 'the render app wrote its results')
  return JSON.parse(readFileSync(out, 'utf8'))
}

let run
test('a real hidden window reads what the direct GET could not, the PDF gives its text, and every way failing is refused', async () => {
  run = await runApp(['/script', '/refused', '/report.pdf', '/refused-all', '/captcha', '/popup'])
  assert.equal(run.error, undefined, run.error)
  const by = Object.fromEntries(run.results.map(r => [new URL(r.url).pathname, r]))

  assert.equal(by['/script'].ok, true, JSON.stringify(by['/script']))
  assert.equal(by['/script'].method, 'render', JSON.stringify(by['/script']))
  assert.match(by['/script'].text, /Version 4 adds offline mode, part 1/)
  assert.deepEqual(by['/script'].tried, ['direct', 'render'])

  assert.equal(by['/refused'].ok, true, JSON.stringify(by['/refused']))
  assert.equal(by['/refused'].method, 'render', JSON.stringify(by['/refused']))
  assert.equal(by['/refused'].http, 403, 'the direct GET was refused')
  assert.match(by['/refused'].text, /The council approved the budget/)

  assert.equal(by['/report.pdf'].ok, true, JSON.stringify(by['/report.pdf']))
  assert.equal(by['/report.pdf'].method, 'pdf')
  assert.match(by['/report.pdf'].text, /Revenue rose by 12 percent/)
  assert.match(by['/report.pdf'].text, /dividend of 0\.30 dollars/)

  assert.equal(by['/refused-all'].ok, false)
  assert.equal(by['/refused-all'].reason, 'blocked')
  assert.deepEqual(by['/refused-all'].tried, ['direct', 'render'])
})

test('it stops at a human check, opens no window of its own, shows nothing, and reads as Streams', async () => {
  assert.ok(run, 'the first test ran the app')
  const by = Object.fromEntries(run.results.map(r => [new URL(r.url).pathname, r]))
  assert.equal(by['/captcha'].reason, 'check')
  assert.deepEqual(by['/captcha'].tried, ['direct'])
  assert.equal(hits.filter(h => h.path === '/captcha').length, 1, 'asked once, never rendered')

  assert.equal(by['/popup'].ok, true)
  assert.ok(run.log.some(l => /render: new window refused: http:\/\/127\.0\.0\.1:1\/elsewhere/.test(l)), run.log.join('\n'))
  assert.equal(hits.filter(h => h.path === '/elsewhere').length, 0)

  assert.deepEqual(run.shown, [], 'no window was ever shown')
  assert.equal(run.windowsLeft, 0, 'every render window was closed')
  // both ways read as Streams: the direct GETs and the hidden window's
  const rendered = hits.filter(h => h.browser)
  assert.ok(rendered.length >= 3, 'the window asked for pages')
  for (const h of hits) assert.match(h.ua, /^Streams\//, `${h.path} (${h.browser ? 'rendered' : 'direct'}): ${h.ua}`)
})

test('the render window\'s settings and guards (no preload, sandboxed, nothing but http(s))', () => {
  assert.equal(RENDER_WEB_PREFERENCES.sandbox, true)
  assert.equal(RENDER_WEB_PREFERENCES.contextIsolation, true)
  assert.equal(RENDER_WEB_PREFERENCES.nodeIntegration, false)
  assert.equal(RENDER_WEB_PREFERENCES.webviewTag, false)
  assert.equal('preload' in RENDER_WEB_PREFERENCES, false)
  assert.equal('partition' in RENDER_WEB_PREFERENCES, false, 'the session is given per window, in memory')
  // the session handlers, on a stand-in session
  const handlers = {}
  const ses = {
    webRequest: { onBeforeRequest: (_f, h) => { handlers.request = h } },
    setPermissionRequestHandler: h => { handlers.permission = h }, setPermissionCheckHandler: h => { handlers.check = h },
    setDevicePermissionHandler: h => { handlers.device = h }, on: (ev, h) => { handlers[ev] = h },
  }
  hardenRenderSession(ses)
  const cancel = url => { let c; handlers.request({ url }, r => { c = r.cancel }); return c }
  assert.equal(cancel('https://example.org/'), false)
  assert.equal(cancel('data:text/plain,x'), false)
  assert.equal(cancel('file:///C:/x'), true)
  assert.equal(cancel('app://ui/index.html'), true)
  let allowed = null
  handlers.permission(null, 'geolocation', v => { allowed = v })
  assert.equal(allowed, false)
  let prevented = false
  handlers['will-download']({ preventDefault: () => { prevented = true } }, { getURL: () => 'https://x/file.zip' })
  assert.equal(prevented, true)
  // the contents guards
  const on = {}
  let openHandler
  guardRenderContents({ setWindowOpenHandler: h => { openHandler = h }, on: (ev, h) => { on[ev] = h } })
  assert.deepEqual(openHandler({ url: 'https://x' }), { action: 'deny' })
  const nav = (ev, url) => { let p = false; on[ev]({ preventDefault: () => { p = true } }, url); return p }
  assert.equal(nav('will-navigate', 'https://x/next'), false)
  assert.equal(nav('will-navigate', 'file:///C:/x'), true)
  assert.equal(nav('will-redirect', 'javascript:alert(1)'), true)
})

test('the PDF reader: a real PDF\'s pages, with a blank line between them; not a PDF throws', async () => {
  const text = await pdfText(makePdf([['First page line one.', 'Line two.'], ['Second page.']]))
  assert.equal(text, 'First page line one.\nLine two.\n\nSecond page.')
  await assert.rejects(() => pdfText(Buffer.from('<html>not a pdf</html>')))
})
