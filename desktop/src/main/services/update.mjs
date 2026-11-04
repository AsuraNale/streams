/**
 * Check for a newer version, and update in place without uninstalling (docs/desktop.md��; work order 08, 2026-10-12).
 *
 *   where      the public releases of AsuraNale/streams on GitHub: one anonymous GET of
 *              https://api.github.com/repos/AsuraNale/streams/releases/latest (60 an hour for an address; only when the
 *              user asks), through the environment's proxy like every request of the main process (env-proxy-fetch.mjs);
 *              10 s, at most 256 KiB of answer
 *   what       `tag_name` (v0.2.1 → 0.2.1: major.minor.patch, digits only), `name`, `body` (the notes: shown as plain text, never
 *              as HTML), `published_at`, and the one asset named Streams-<version>-setup.exe with its `size`, its `digest`
 *              (sha256:<64 hex>) and its `browser_download_url` (under DOWNLOAD_PREFIX). A newer version without that asset,
 *              without a digest, or with a tag that is not a version is not offered: the page says to download it from the
 *              release page by hand. Drafts and pre-releases are not looked at (releases/latest never gives them anyway).
 *   download   from that address and at most 5 redirects, each https to github.com or a host under githubusercontent.com
 *              (GitHub's storage: isGitHubDownloadHost), nowhere else;
 *              into <appData>/updates/ (never the program folder): <name>.part while it comes, its SHA-256 taken on the way,
 *              stopped when more than `size` bytes come or nothing comes for 60 s (no total time limit); at the end the size
 *              and the SHA-256 must be the release's, else the file is deleted and nothing runs. Then renamed to <name>.
 *   install    only when no research turn runs (otherwise the page says to wait; nothing is interrupted); the file is checked
 *              again (size, SHA-256) right before it runs; started on its own (detached, no stdio, no console window) with
 *              /SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /STRELAUNCH=1 /STWAITPID=<this main process's pid> — the
 *              setup program first waits (at most 60 s) for this process to have exited before it installs (the handshake:
 *              installer/setup/streams.iss [Code] PrepareToInstall, before the Restart Manager looks), shows its progress,
 *              installs over this copy (same AppId: the uninstall entry, the shortcuts, the app's data and the library stay)
 *              and, because of /STRELAUNCH=1, opens Streams again when done (installer/setup/streams.iss [Run]). Once it has
 *              started, the app quits the ordinary way (`quit`: app.quit — the helpers end as at any quit).
 *   leftovers  every file in <appData>/updates/ is removed at the next start (`cleanUp`): the setup program has run by then.
 *   dev        a development run (npm start, npm run trial) may check but does not download or update (`canUpdate` false);
 *              the tests open both with stand-ins (update-wiring.mjs).
 *
 * States (`snapshot().state`):
 *   idle · checking · up_to_date · available · manual (newer, but it cannot be checked: download by hand) · check_failed ·
 *   downloading · download_failed · verify_failed · ready (downloaded and checked; waiting for 「开始更新」) · launching ·
 *   launch_failed
 * @module desktop/main/services/update
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { VERSION_RE } from '../version.mjs'
import { envProxyFetch, envProxyOpen } from './env-proxy-fetch.mjs'

export const RELEASES_REPO = 'AsuraNale/streams'
export const API_BASE_URL = 'https://api.github.com'
export const LATEST_PATH = `/repos/${RELEASES_REPO}/releases/latest`
/** The releases page: 「查看完整说明」 opens the release's own page when GitHub names one under it, else this. */
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases`
/** Where GitHub serves a release's assets from (their browser_download_url); it redirects to its storage. */
export const DOWNLOAD_PREFIX = `https://github.com/${RELEASES_REPO}/releases/download/`
/**
 * Where a download may go on the way (its redirects): https, the default port, github.com itself or a host under
 * githubusercontent.com — GitHub's storage for release assets (objects.githubusercontent.com, since 2025
 * release-assets.githubusercontent.com). Nowhere else; a stand-in on this machine (development, tests) has its own rule.
 * @param {URL} url
 */
export function isGitHubDownloadHost(url) {
  return url.protocol === 'https:' && url.port === '' && (url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com'))
}
/** What the setup program is started with (work order 08 §二; installer/setup/streams.iss reads /STRELAUNCH), before /STWAITPID. */
export const SETUP_ARGS = Object.freeze(['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/STRELAUNCH=1'])
/** The handshake's switch: the process the setup program waits for before it installs (installer/setup/streams.iss). */
export const WAIT_PID_SWITCH = '/STWAITPID'
/** The whole argument list for a main process id: SETUP_ARGS, then /STWAITPID=<pid>. */
export function setupArgs(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError(`setupArgs: not a process id: ${pid}`)
  return [...SETUP_ARGS, `${WAIT_PID_SWITCH}=${pid}`]
}
export const CHECK_TIMEOUT_MS = 10_000
export const STALL_MS = 60_000
export const MAX_API_BYTES = 256 * 1024
/** A setup program bigger than this is not ours (0.2.0's is 211 MiB). */
export const MAX_SETUP_BYTES = 1024 * 1024 * 1024
export const MAX_NOTES = 20_000
export const MAX_REDIRECTS = 5
export const STATES = Object.freeze(['idle', 'checking', 'up_to_date', 'available', 'manual', 'check_failed', 'downloading', 'download_failed',
  'verify_failed', 'ready', 'launching', 'launch_failed'])

const own = (o, k) => (o !== null && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined)
const SHA256 = /^sha256:([0-9a-f]{64})$/i

/** 'v0.2.1' or '0.2.1' → { major, minor, patch, text: '0.2.1' }; anything else (a pre-release part too) → null. */
export function parseVersion(value) {
  if (typeof value !== 'string') return null
  const m = VERSION_RE.exec(value.trim().replace(/^v/i, ''))
  if (!m) return null
  const [major, minor, patch] = m.slice(1, 4).map(Number)
  return { major, minor, patch, text: `${major}.${minor}.${patch}` }
}

/** -1, 0 or 1 (a before b, the same, a after b), by major, minor, patch as numbers. */
export function compareVersions(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1
  }
  return 0
}

/** The setup program's name for a version (installer/setup/release.json `output_base_filename` + .exe). */
export const setupName = version => `Streams-${version}-setup.exe`

/**
 * The release notes as plain text: GitHub's Markdown marks taken off (emphasis, code, links and images keep their words,
 * headings and quotes their text, list items a dot), line by line; nothing of it is ever rendered as HTML.
 */
export function plainNotes(body) {
  if (typeof body !== 'string') return ''
  const lines = body.replace(/\r\n?/g, '\n').slice(0, MAX_NOTES * 2).split('\n').map(line => line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/^(\s*)[-*+]\s+/, '$1· ')
    .replace(/\s+$/, ''))
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_NOTES)
}

/**
 * GitHub's answer for the latest release → what the app does with it.
 * @param {string|object} body
 * @param {object} o
 * @param {string} o.current - this app's version
 * @param {string} [o.downloadPrefix] - where the asset must be served from
 * @returns {{ok: false, reason: 'bad_json'|'bad_shape'}
 *   | {ok: true, kind: 'not_newer', version: string|null}
 *   | {ok: true, kind: 'manual', reason: 'bad_version'|'no_asset'|'no_digest'|'bad_size'|'bad_url', release: object}
 *   | {ok: true, kind: 'newer', release: object}}
 */
export function parseRelease(body, { current, downloadPrefix = DOWNLOAD_PREFIX }) {
  let data = body
  if (typeof body === 'string') {
    try { data = JSON.parse(body) } catch { return { ok: false, reason: 'bad_json' } }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data) || typeof own(data, 'tag_name') !== 'string') return { ok: false, reason: 'bad_shape' }
  // drafts and pre-releases are not looked at
  if (own(data, 'draft') === true || own(data, 'prerelease') === true) return { ok: true, kind: 'not_newer', version: null }
  const published = typeof own(data, 'published_at') === 'string' && !Number.isNaN(Date.parse(data.published_at)) ? new Date(data.published_at).toISOString() : null
  // the release's own page when it is one of this repository's, else the list of releases; judged on the address as the URL
  // parser writes it (dot segments resolved, quotes and spaces escaped), and that written form is what is opened
  let page = null
  try { page = typeof own(data, 'html_url') === 'string' ? new URL(data.html_url) : null } catch { page = null }
  const release = {
    version: null,
    name: typeof own(data, 'name') === 'string' ? data.name.slice(0, 200) : null,
    publishedAt: published,
    notes: plainNotes(own(data, 'body')),
    pageUrl: page && !page.username && !page.password && page.href.startsWith(`${RELEASES_PAGE}/`) ? page.href : RELEASES_PAGE,
  }
  const version = parseVersion(data.tag_name)
  const mine = parseVersion(current)
  if (!version || !mine) return { ok: true, kind: 'manual', reason: 'bad_version', release }
  release.version = version.text
  if (compareVersions(version, mine) <= 0) return { ok: true, kind: 'not_newer', version: version.text }
  const assets = Array.isArray(own(data, 'assets')) ? data.assets : []
  const name = setupName(version.text)
  const asset = assets.find(a => own(a, 'name') === name)
  if (!asset) return { ok: true, kind: 'manual', reason: 'no_asset', release }
  const digest = SHA256.exec(typeof own(asset, 'digest') === 'string' ? asset.digest : '')
  if (!digest) return { ok: true, kind: 'manual', reason: 'no_digest', release }
  const size = own(asset, 'size')
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SETUP_BYTES) return { ok: true, kind: 'manual', reason: 'bad_size', release }
  const url = own(asset, 'browser_download_url')
  let parsed = null
  try { parsed = typeof url === 'string' ? new URL(url) : null } catch { parsed = null }
  if (!parsed || !parsed.href.startsWith(downloadPrefix) || parsed.username || parsed.password) return { ok: true, kind: 'manual', reason: 'bad_url', release }
  return { ok: true, kind: 'newer', release: { ...release, asset: { name, url: parsed.href, size, sha256: digest[1].toLowerCase() } } }
}

/** SHA-256 and size of a file, read as a stream. */
export function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let size = 0
    createReadStream(file)
      .on('data', chunk => { size += chunk.length; hash.update(chunk) })
      .on('error', reject)
      .on('end', () => resolve({ size, sha256: hash.digest('hex') }))
  })
}

/** Remove a file, quietly (gone already, or in use: logged by the caller when it matters). */
function removeFile(file) {
  try { rmSync(file, { force: true }); return true } catch { return false }
}

/**
 * Every file left in the updates folder (a setup program that ran, a download cut short): removed, not followed when a link;
 * one still in use stays for the next start. The folder itself must be a real folder: a link or junction in its place is
 * not followed (its target's files are never touched). Returns what was removed and what stayed.
 */
export function cleanUpdates(dir) {
  const removed = []
  const kept = []
  let names = []
  try {
    if (!lstatSync(dir).isDirectory()) return { removed, kept }
    names = readdirSync(dir)
  } catch { return { removed, kept } }
  for (const name of names) {
    const path = join(dir, name)
    let st
    try { st = lstatSync(path) } catch { continue }
    if (!st.isFile() && !st.isSymbolicLink()) { kept.push(name); continue }
    if (removeFile(path)) removed.push(name)
    else kept.push(name)
  }
  return { removed, kept }
}

/**
 * @param {object} o
 * @param {string} o.dir - <appData>/updates
 * @param {string} o.current - this app's version (version.mjs)
 * @param {boolean} [o.dev] - a development run (the page says so next to the version)
 * @param {boolean} [o.canUpdate] - may download and install (false in a development run unless a test opens it)
 * @param {string} [o.apiBaseURL] - GitHub's API (a stand-in in development and tests)
 * @param {string} [o.downloadPrefix] - where an asset must come from (a stand-in's in development and tests)
 * @param {boolean} [o.allowHttp] - a stand-in on this machine: the download and its redirects may be http
 * @param {Function|null} [o.fetchImpl] - the check's GET (env-proxy-fetch.mjs); null: no source (the tests' `off`)
 * @param {Function} [o.openImpl] - the download's streamed GET (env-proxy-fetch.mjs)
 * @param {Function} [o.spawnImpl] - how the setup program is started (child_process.spawn; tests record it)
 * @param {number} [o.pid] - the main process's id, given to the setup program to wait for (process.pid; tests set it)
 * @param {() => void} [o.quit] - the app's ordinary quit, once the setup program runs
 * @param {() => boolean} [o.turnRunning] - is a research turn running now
 * @param {(snapshot: object) => void} [o.onChange]
 * @param {(line: string) => void} [o.log]
 */
export function createUpdateService({
  dir, current, dev = false, canUpdate = !dev, apiBaseURL = API_BASE_URL, downloadPrefix = DOWNLOAD_PREFIX, allowHttp = false,
  fetchImpl = envProxyFetch({ maxBytes: MAX_API_BYTES }), openImpl = envProxyOpen(), spawnImpl = nodeSpawn, pid = process.pid, quit = () => {},
  turnRunning = () => false, onChange = () => {}, log = () => {}, clock = () => new Date(),
  checkTimeoutMs = CHECK_TIMEOUT_MS, stallMs = STALL_MS, progressEveryMs = 250, quitDelayMs = 300,
}) {
  const s = { state: 'idle', checkedAt: null, release: null, reason: null, received: 0, file: null }
  let checking = null
  let download = null // { controller, promise }
  let lastProgress = 0
  let checks = 0
  let seq = 0 // grows with every change: the page keeps the newest snapshot whichever way it came (event or answer)

  const running = () => { try { return turnRunning() === true } catch { return false } }

  function snapshot() {
    const r = s.release
    return {
      seq,
      state: s.state,
      current,
      dev,
      canUpdate,
      checkedAt: s.checkedAt,
      // what the page shows of the release: never the download address or the digest
      release: r ? { version: r.version, name: r.name, publishedAt: r.publishedAt, notes: r.notes, size: r.asset?.size ?? null } : null,
      progress: s.state === 'downloading' ? { received: s.received, total: r?.asset?.size ?? null } : null,
      reason: s.reason,
      turnRunning: running(),
    }
  }

  const changed = () => { seq++; try { onChange(snapshot()) } catch (err) { log(`update: onChange: ${err.message}`) } }
  const set = (state, more = {}) => { Object.assign(s, { reason: null }, more, { state }); changed() }

  /** One GET of the latest release; a check in flight is shared. */
  function check() {
    if (checking) return checking
    // nothing to ask while a download runs, the setup program starts, or one is downloaded and waits
    if (['downloading', 'ready', 'launching'].includes(s.state)) return Promise.resolve(snapshot())
    checks++
    set('checking')
    checking = (async () => {
      let result
      try {
        result = await askGitHub()
      } finally {
        checking = null
      }
      s.checkedAt = clock().toISOString()
      if (!result.ok) {
        log(`update: the check failed: ${result.reason}`)
        set('check_failed', { reason: result.reason })
      } else if (result.kind === 'not_newer') {
        log(`update: no newer version (latest ${result.version ?? 'not a version'}; this is ${current})`)
        dropDownload()
        set('up_to_date', { release: null })
      } else if (result.kind === 'manual') {
        log(`update: ${result.release.version ?? 'a release'} cannot be checked (${result.reason}): download it by hand`)
        dropDownload()
        set('manual', { release: result.release, reason: result.reason })
      } else {
        const r = result.release
        log(`update: ${r.version} is available (this is ${current})`)
        dropDownload()
        set('available', { release: r })
      }
      return snapshot()
    })()
    return checking
  }

  async function askGitHub() {
    if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no_source' }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), checkTimeoutMs)
    try {
      const res = await fetchImpl(`${apiBaseURL.replace(/\/+$/u, '')}${LATEST_PATH}`, {
        method: 'GET',
        headers: { accept: 'application/vnd.github+json', 'user-agent': `Streams/${current}` },
        signal: controller.signal,
      })
      if (!res || typeof res.status !== 'number') return { ok: false, reason: 'bad_response' }
      if (res.status !== 200) return { ok: false, reason: `http_${res.status}` }
      return parseRelease(await res.text(), { current, downloadPrefix })
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') return { ok: false, reason: 'timeout' }
      if (err instanceof RangeError) return { ok: false, reason: 'too_large' }
      return { ok: false, reason: 'network' }
    } finally {
      clearTimeout(timer)
    }
  }

  /** The downloaded file (and a partial one) goes; the state does not change here. */
  function dropDownload() {
    if (s.file) { removeFile(s.file); s.file = null }
  }

  // every address of the download, the first and each redirect: GitHub's own over https (isGitHubDownloadHost); with a
  // stand-in on this machine (allowHttp: development and tests), any https one or its own loopback http
  const allowedUrl = url => {
    let u
    try { u = new URL(url) } catch { return false }
    if (u.username || u.password) return false
    if (!allowHttp) return isGitHubDownloadHost(u)
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
  }

  /** Download the release's setup program into the updates folder, checking it on the way and at the end. */
  function startDownload() {
    if (!canUpdate) return { ok: false, reason: 'dev_build' }
    if (download) return { ok: true }
    if (!['available', 'download_failed', 'verify_failed', 'launch_failed'].includes(s.state) || !s.release?.asset) return { ok: false, reason: 'not_available' }
    const release = s.release
    const asset = release.asset
    const final = join(dir, asset.name)
    const part = `${final}.part`
    try {
      mkdirSync(dir, { recursive: true })
      cleanUpdates(dir)
    } catch (err) {
      log(`update: the updates folder: ${err.code ?? err.message}`)
    }
    const controller = new AbortController()
    s.received = 0
    s.file = null
    set('downloading')
    log(`update: downloading ${asset.name} (${asset.size} bytes)`)
    const promise = fetchTo({ url: asset.url, part, asset, controller })
      .then(async () => {
        renameSync(part, final)
        s.file = final
        log(`update: ${asset.name} downloaded; its size and SHA-256 are the release's`)
        set('ready')
      })
      .catch(err => {
        removeFile(part)
        if (controller.signal.reason === 'cancelled') {
          log('update: the download was cancelled')
          set('available')
        } else if (err?.verify) {
          log(`update: the download did not pass the check (${err.verify}); deleted, nothing runs`)
          set('verify_failed', { reason: err.verify })
        } else {
          const reason = controller.signal.reason === 'stalled' ? 'stalled' : typeof err?.reason === 'string' ? err.reason : 'network'
          log(`update: the download failed: ${reason}`)
          set('download_failed', { reason })
        }
      })
      .finally(() => { download = null })
    download = { controller, promise }
    return { ok: true }
  }

  /** The streamed GET with its redirects, the size and SHA-256 counted on the way; rejects with { verify } or { reason }. */
  async function fetchTo({ url, part, asset, controller }) {
    const { signal } = controller
    let stall = null
    const quiet = () => { clearTimeout(stall); stall = setTimeout(() => controller.abort('stalled'), stallMs) }
    quiet()
    try {
      let address = url
      for (let hop = 0; ; hop++) {
        if (!allowedUrl(address)) throw Object.assign(new Error('address'), { reason: 'bad_url' })
        const res = await openImpl(address, { method: 'GET', headers: { accept: 'application/octet-stream', 'user-agent': `Streams/${current}` }, signal })
        quiet()
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          res.body.resume()
          const location = res.headers?.location
          if (typeof location !== 'string' || hop >= MAX_REDIRECTS) throw Object.assign(new Error('redirect'), { reason: 'bad_redirect' })
          address = new URL(location, address).href
          continue
        }
        if (res.status !== 200) { res.body.resume(); throw Object.assign(new Error('status'), { reason: `http_${res.status}` }) }
        const length = Number(res.headers?.['content-length'])
        if (res.headers?.['content-length'] !== undefined && length !== asset.size) { res.body.resume(); throw Object.assign(new Error('size'), { verify: 'size' }) }
        await readInto(res.body, { part, asset, signal, onData: quiet })
        return
      }
    } finally {
      clearTimeout(stall)
    }
  }

  function readInto(body, { part, asset, signal, onData }) {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const out = createWriteStream(part)
      let done = false
      const fail = err => {
        if (done) return
        done = true
        body.destroy()
        out.destroy()
        // the file handle is closed before the caller deletes the partial file
        out.once('close', () => reject(err))
        if (out.closed) reject(err)
      }
      out.on('error', err => fail(Object.assign(err, { reason: 'write' })))
      const aborted = () => fail(Object.assign(new Error('aborted'), { reason: String(signal.reason ?? 'aborted') }))
      if (signal.aborted) { aborted(); return }
      signal.addEventListener('abort', aborted, { once: true })
      body.on('data', chunk => {
        if (done) return
        onData()
        s.received += chunk.length
        if (s.received > asset.size) { fail(Object.assign(new Error('size'), { verify: 'size' })); return }
        hash.update(chunk)
        if (!out.write(chunk)) { body.pause(); out.once('drain', () => body.resume()) }
        const now = Date.now()
        if (now - lastProgress >= progressEveryMs) { lastProgress = now; changed() }
      })
      body.on('error', err => fail(Object.assign(err, { reason: 'network' })))
      body.on('end', () => {
        if (done) return
        // judged once the file is closed (Windows renames and deletes only a closed file)
        out.once('close', () => {
          if (done) return
          done = true
          signal.removeEventListener('abort', aborted)
          if (s.received !== asset.size) reject(Object.assign(new Error('size'), { verify: 'size' }))
          else if (hash.digest('hex') !== asset.sha256) reject(Object.assign(new Error('sha256'), { verify: 'sha256' }))
          else resolve()
        })
        out.end()
      })
      body.on('close', () => { if (!body.complete) fail(Object.assign(new Error('cut off'), { reason: 'network' })) })
    })
  }

  /** Stop a download: the partial file goes, the release is offered again. */
  async function cancel() {
    if (!download) return snapshot()
    const { controller, promise } = download
    controller.abort('cancelled')
    await promise.catch(() => {})
    return snapshot()
  }

  /** Start the checked setup program and quit; or say why not. */
  async function install() {
    if (!canUpdate) return { ok: false, reason: 'dev_build' }
    if (!['ready', 'launch_failed'].includes(s.state) || !s.file || !s.release?.asset) return { ok: false, reason: 'not_ready' }
    if (running()) { log('update: a research turn is running; the update waits'); changed(); return { ok: false, reason: 'turn_running' } }
    const { asset } = s.release
    const file = s.file
    set('launching')
    // checked again right before it runs: the file may have changed on the disk since the download
    let seen = null
    try { seen = await hashFile(file) } catch { seen = null }
    if (!seen || seen.size !== asset.size || seen.sha256 !== asset.sha256) {
      removeFile(file)
      s.file = null
      log(`update: ${asset.name} is not what was downloaded any more (${seen ? (seen.size !== asset.size ? 'size' : 'sha256') : 'unreadable'}); deleted, nothing runs`)
      set('verify_failed', { reason: seen ? (seen.size !== asset.size ? 'size' : 'sha256') : 'missing' })
      return { ok: false, reason: 'verify_failed' }
    }
    // a turn may have started while the file was read
    if (running()) { set('ready'); log('update: a research turn started; the update waits'); return { ok: false, reason: 'turn_running' } }
    let child
    try {
      child = await new Promise((resolve, reject) => {
        const c = spawnImpl(file, setupArgs(pid), { detached: true, stdio: 'ignore', windowsHide: true, cwd: dir })
        c.once('error', reject)
        c.once('spawn', () => resolve(c))
      })
    } catch (err) {
      log(`update: the setup program did not start: ${err?.code ?? err?.message ?? err}`)
      set('launch_failed', { reason: 'spawn' })
      return { ok: false, reason: 'launch_failed' }
    }
    try { child.unref() } catch { /* a stand-in without it */ }
    log(`update: the setup program of ${s.release.version} started (pid ${child.pid ?? '?'}): ${setupArgs(pid).join(' ')}; the app quits`)
    // the page gets its answer first; then the ordinary quit (the helpers end with it)
    setTimeout(() => { try { quit() } catch (err) { log(`update: quit: ${err.message}`) } }, quitDelayMs)
    return { ok: true }
  }

  return {
    snapshot,
    check,
    /** Start the download; resolves at once with the snapshot (progress comes as `update` events). */
    download: async () => {
      const r = startDownload()
      if (!r.ok && r.reason !== 'not_available') log(`update: no download: ${r.reason}`)
      return snapshot()
    },
    cancel,
    install,
    /** The leftovers of an earlier update (the setup program that ran, a download cut short). */
    cleanUp() {
      const r = cleanUpdates(dir)
      if (r.removed.length || r.kept.length) log(`update: the updates folder: ${r.removed.length} file(s) removed${r.kept.length ? `, ${r.kept.length} still in use (next start)` : ''}`)
      return r
    },
    /** The page's link to the notes: the release's own page, else the list of releases. */
    pageUrl: () => s.release?.pageUrl ?? RELEASES_PAGE,
    /** Something the page shows may have changed (a turn started or ended). */
    poke: () => changed(),
    /** Number of checks sent in this run (tests). */
    checks: () => checks,
    /** The download in flight, settled (tests). */
    settled: () => (download ? download.promise.catch(() => {}) : Promise.resolve()),
  }
}
