/**
 * The world an installer test runs the installed app in (docs/installer.md §五):
 *
 *   startFeed()        an RSS feed on this machine (127.0.0.1, a port of its own): three items, each with its page — v2
 *                      package J2: an article long enough for the reading window's 阅读模式 (well over its 200 characters),
 *                      inside a menu and a script; the script, if it ever ran, would ask /script-ran (itemPage below)
 *   startTrap()        the egress trap: an HTTP proxy that refuses everything and records what came (requests, CONNECTs).
 *                      The app runs with HTTP_PROXY / HTTPS_PROXY pointing at it (and NODE_USE_ENV_PROXY=1, so Node's own
 *                      fetch takes the proxy too) and Chromium with --proxy-server at it; loopback is never proxied.
 *                      Anything the app sends past the harness's record lands here — and goes no further
 *   appEnv(o)          the app's whole environment: a machine without Node, Python, git or a model tool on PATH
 *                      (System32 only); the user's folders (USERPROFILE, APPDATA, LOCALAPPDATA, TEMP) inside the test's
 *                      folder; the trap as the proxy; and every development switch the app knows (STREAMS_*) set — to a
 *                      trap. A packaged app must take none of them; `trapsUntouched` says what each would have changed
 * @module installer/test/world
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SYSTEM32 } from './machine.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
// v2 package J2: what the page's script would ask if it ran (the reading window's 阅读模式 runs no script of the page)
export const SCRIPT_RAN = '/script-ran'
/** v2 package J2: the text of item n's article, a sentence that only its page carries (the reading page must show it). */
export const articleLine = n => `Item ${n} of the installer check reads as an article: the reading window takes this text out of the page.`

/** v2 package J2: item n's page — a menu, a script and an article of four paragraphs (was one short line in v1.0). */
function itemPage(n) {
  const paras = [
    articleLine(n),
    'The second paragraph says what the installed app does with it: the reader asks this page from the feed on this machine, through its own session, and nothing else.',
    'The third paragraph is here so that the article is well over the two hundred characters the reading mode wants before it shows a page of its own.',
    'The last paragraph closes the article. None of these words are links, so the page is not mostly links either.',
  ]
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Item ${n}</title></head><body>
    <nav><a href="/">Home</a> <a href="/news">News</a> <a href="/about">About us</a></nav>
    <script>fetch('${SCRIPT_RAN}')</script>
    <article><h1>Streams installer check: item ${n}</h1>${paras.map(p => `<p>${p}</p>`).join('')}</article></body></html>`
}
export const FEED_ITEMS = Object.freeze([
  { n: 1, title: 'Streams installer check: the first item' },
  { n: 2, title: 'Streams installer check: the second item' },
  { n: 3, title: 'Streams installer check: the third item' },
])

export async function startFeed() {
  const requests = []
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    const base = `http://127.0.0.1:${server.address().port}`
    if (req.url === '/feed') {
      const items = FEED_ITEMS.map(i => `<item><title>${i.title}</title><link>${base}/item/${i.n}</link><pubDate>${new Date(Date.now() - i.n * DAY_MS / 4).toUTCString()}</pubDate><description>Summary of item ${i.n}: what the installer test reads.</description></item>`)
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
      res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>installer test feed</title>\n${items.join('\n')}\n</channel></rss>`)
      return
    }
    const m = /^\/item\/(\d+)$/.exec(req.url ?? '')
    if (m) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(itemPage(Number(m[1]))); return }
    res.writeHead(404).end('no')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, feed: `${base}/feed`, host: `127.0.0.1:${server.address().port}`, requests, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}

const REFUSED = ['HTTP/1.1 403 Forbidden', 'Content-Length: 0', 'Connection: close', '', ''].join('\r\n')

export async function startTrap() {
  const requests = []
  const server = createServer((req, res) => { requests.push(`${req.method} ${req.url}`); res.writeHead(502).end() })
  // a tunnel is refused with an answer (a socket just closed makes Chromium try again and again)
  server.on('connect', (req, socket) => { requests.push(`CONNECT ${req.url}`); socket.on('error', () => {}); socket.end(REFUSED) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}

/** The development switches, each set to a trap (folders below `traps`, a file that must never appear, a stand-in address). */
export function trapSwitches(traps, trapUrl) {
  for (const d of ['app-data', 'local-data', 'library', 'choose-folder']) mkdirSync(join(traps, d), { recursive: true })
  // v2 package N: package M's switch, a quota file read at start — the trap is a file that is not JSON, so an app that took
  // the switch would write 「quota: development file not read」 into its main.log (QUOTA_TRAP_LINE; packaged.test.mjs looks)
  writeFileSync(join(traps, 'quota.json'), 'not JSON: a trap of the installer test (STREAMS_DEV_QUOTA)\n')
  return {
    STREAMS_DEV_QUOTA: join(traps, 'quota.json'),
    STREAMS_APP_DATA: join(traps, 'app-data'),
    STREAMS_LOCAL_DATA: join(traps, 'local-data'),
    STREAMS_WINDOW: 'hidden',
    STREAMS_START_SCREEN: 'settings',
    STREAMS_DEV_SYSTEM_LANGUAGES: 'en',
    STREAMS_DEV_UPDATE_URL: `${trapUrl}/`,
    STREAMS_DEV_UPDATE_SETUP_RECORD: join(traps, 'setup-record.json'),
    STREAMS_DEV_LIBRARY: join(traps, 'library'),
    STREAMS_DEV_CHOOSE_FOLDER: join(traps, 'choose-folder'),
    STREAMS_DEV_CONNECTION: 'fake',
    STREAMS_DEV_NOW: '2001-02-03T04:05:06.000Z',
  }
}

/** v2 package N: what main.log would say had the app taken STREAMS_DEV_QUOTA (its trap file is not JSON; services/quota.mjs). */
export const QUOTA_TRAP_LINE = 'quota: development file not read'

/** The trap folders and file are as they were made (empty / absent): [] when no switch was taken. */
export function trapsUntouched(traps) {
  const wrong = []
  for (const d of ['app-data', 'local-data', 'library', 'choose-folder']) {
    const names = readdirSync(join(traps, d))
    if (names.length) wrong.push(`${d}: ${names.join(', ')}`)
  }
  if (existsSync(join(traps, 'setup-record.json'))) wrong.push('setup-record.json was written')
  return wrong
}

/**
 * @param {object} o
 * @param {string} o.profile - the test's user folder (USERPROFILE; AppData\Roaming and AppData\Local below it)
 * @param {string} o.tmp - TEMP / TMP
 * @param {string} o.trapUrl - the egress trap (the proxy)
 * @param {string} o.traps - where the switches' trap folders go
 */
export function appEnv({ profile, tmp, trapUrl, traps }) {
  const env = {}
  for (const k of ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION', 'OS', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432', 'PUBLIC', 'ALLUSERSPROFILE', 'SystemDrive']) {
    if (process.env[k] !== undefined) env[k] = process.env[k]
  }
  const roaming = join(profile, 'AppData', 'Roaming')
  const local = join(profile, 'AppData', 'Local')
  // v2 package J2: and the profile's Documents, as every Windows profile has it — a new library's default place is
  // Documents\Streams (desktop/src/main/library-root.mjs); with USERPROFILE moved it resolves to this folder, not the real
  // one (packaged.test.mjs 3 checks getLibraryRoot). Before library-root.mjs the packaged v2 did not start at all without
  // it ("Failed to get 'documents' path"); packaged.test.mjs 4b starts the installed app with this folder removed
  for (const d of [roaming, local, tmp, join(profile, 'Documents')]) mkdirSync(d, { recursive: true })
  Object.assign(env, {
    USERPROFILE: profile, HOME: profile, HOMEDRIVE: profile.slice(0, 2), HOMEPATH: profile.slice(2), APPDATA: roaming, LOCALAPPDATA: local, TEMP: tmp, TMP: tmp,
    PATH: [SYSTEM32, join(SYSTEM32, 'Wbem'), join(SYSTEM32, 'WindowsPowerShell', 'v1.0')].join(';'),
    HTTP_PROXY: trapUrl, HTTPS_PROXY: trapUrl, NO_PROXY: '127.0.0.1,localhost,::1', NODE_USE_ENV_PROXY: '1',
    ...trapSwitches(traps, trapUrl),
  })
  return env
}
