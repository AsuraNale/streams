/**
 * The world an installer test runs the installed app in (docs/installer.md §五):
 *
 *   startFeed()        an RSS feed on this machine (127.0.0.1, a port of its own): three items, each with its page
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
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SYSTEM32 } from './machine.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
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
    if (m) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<html><body><p>Body of item ${m[1]}. Nothing else.</p></body></html>`); return }
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
  return {
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
  for (const d of [roaming, local, tmp]) mkdirSync(d, { recursive: true })
  Object.assign(env, {
    USERPROFILE: profile, HOME: profile, HOMEDRIVE: profile.slice(0, 2), HOMEPATH: profile.slice(2), APPDATA: roaming, LOCALAPPDATA: local, TEMP: tmp, TMP: tmp,
    PATH: [SYSTEM32, join(SYSTEM32, 'Wbem'), join(SYSTEM32, 'WindowsPowerShell', 'v1.0')].join(';'),
    HTTP_PROXY: trapUrl, HTTPS_PROXY: trapUrl, NO_PROXY: '127.0.0.1,localhost,::1', NODE_USE_ENV_PROXY: '1',
    ...trapSwitches(traps, trapUrl),
  })
  return env
}
