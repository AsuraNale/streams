/**
 * The user's settings, in <appData>/settings.json — the protected folder:
 *   language            the language of the app's own words (locale.mjs): auto (default: follow the system) · zh-CN · en
 *   libraryPath         the library folder the app has open (an absolute path), or null until one is opened (「未打开库」)
 *   recentLibraries     the library folders opened before, most recent first, absolute paths, at most RECENT_MAX
 *                       (the settings page's 「库 · 其他」; openRecentLibrary accepts only one of these)
 *   connections         which way the model is reached (plan C2): `active` (claude-code · codex · api · null), and for
 *                       each kind its model slots (`model`, `verifyModel`: an id, or null = that connection's default;
 *                       verify null = same as the main model); `api` also has `vendor` (core VENDOR_IDS) and `baseUrl`
 *                       (only `custom` uses it, else null). The key itself is never here: secrets.mjs (safeStorage).
 *   showDeveloperInfo   the advanced switch of the settings page (default off)
 *   schedule            the timed round (A2; docs/core-api.md 5.10): { enabled, time: 'HH:MM' }, default
 *                       { enabled: true, time: '08:30' }; each of the two fields checked on its own
 *   theme               the app's look (theme.mjs; redesign R1): precision · glass · research · monoline (the template's four);
 *                       anything else is DEFAULT_THEME (research)
 *   appearance          light · dark · system (follow Windows); anything else is DEFAULT_APPEARANCE (system). Older theme ids
 *                       are migrated when the file is read (theme.mjs migrateLook, the R1 contract's table): none / river /
 *                       any other value → research + system, paper → research + light, night → research + dark, the four
 *                       ids of now kept with their appearance; the next write stores the two fields. No other field is
 *                       touched by this.
 *   libraryRoot         v2 package B: where a new library a proposal card makes goes when the card names no folder
 *                       (<libraryRoot>\<the library's name as a folder name>); an absolute path, or null (default) = the
 *                       app's default place (main.mjs: %USERPROFILE%\Documents\Streams in the packaged app). v2 package I: the
 *                       settings page shows and changes it (getLibraryRoot / chooseLibraryRoot / setLibraryRoot,
 *                       services/library.mjs: never inside the app-data folder); 新建库's folder dialog opens there
 *   setupConnection     v2 package I: who decided 首次打开's connection step, written while there is no library yet:
 *                       { by, at, detail? } (by: core SETUP_BY; at: an ISO time; detail: the kind chosen), or null (default).
 *                       Copied into a library's streams.json setup.connection (its `at` kept) when 新建库 makes one that
 *                       has no connection record (services/library.mjs)
 *   panel               v2 package L: the main window's right panel — { open: boolean, tab: progress · decide · detail · files };
 *                       default { open: true, tab: 'detail' }; each field checked on its own (setPanel, app-services.mjs)
 *   sourceContact       1.1.1 P9 (B24): 设置「来源授权」's contact e-mail, sent only to the sites of the list that comes with the
 *                       app (core fetch/site-auth.mjs SITE_AUTH), shared by every library; an e-mail address (core isContact)
 *                       or null (default: nothing filled in, nothing sent)
 * Read whole and checked field by field (a field that is not what it should be is its default; inside `connections`
 * each field on its own); written whole, through a temporary file and a rename, so a crash never leaves half a file.
 * @module desktop/main/settings
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { DEFAULT_LANGUAGE, LANGUAGE_SETTINGS } from './locale.mjs'
import { DEFAULT_SCHEDULE, SETUP_BY, VENDOR_IDS, isContact, isScheduleTime } from './core.mjs'
import { isAppearance, isThemeId, migrateLook } from './theme.mjs'

export const SETTINGS_SCHEMA = 'streams.settings/1'
export const CONNECTION_KINDS = Object.freeze(['claude-code', 'codex', 'api'])
export const RECENT_MAX = 8
export const DEFAULT_VENDOR = 'anthropic'

const own = (o, k) => (o !== null && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined)
const isObject = o => o !== null && typeof o === 'object' && !Array.isArray(o)
const HTTP_URL = /^https?:\/\/\S+$/i

/** The connection settings with every field at its default. */
export function defaultConnections() {
  return {
    active: null,
    'claude-code': { model: null, verifyModel: null },
    codex: { model: null, verifyModel: null },
    api: { vendor: DEFAULT_VENDOR, baseUrl: null, model: null, verifyModel: null },
  }
}

// v2 package L: the right panel's four tabs, in their order (screens/right-panel.js)
export const PANEL_TABS = Object.freeze(['progress', 'decide', 'detail', 'files'])
export const DEFAULT_PANEL = Object.freeze({ open: true, tab: 'detail' })

/** v2 package L: the right panel's state, each field checked on its own (a bad one is its default). */
export function normalizePanel(raw) {
  const open = own(raw, 'open')
  const tab = own(raw, 'tab')
  return { open: typeof open === 'boolean' ? open : DEFAULT_PANEL.open, tab: PANEL_TABS.includes(tab) ? tab : DEFAULT_PANEL.tab }
}

/** v2 package L: a change of the right panel the page may ask for — { open?, tab? }, at least one, nothing else. */
export function isPanelPatch(raw) {
  return isObject(raw) && Object.keys(raw).length > 0 && Object.keys(raw).every(k => k === 'open' || k === 'tab')
    && (raw.open === undefined || typeof raw.open === 'boolean') && (raw.tab === undefined || PANEL_TABS.includes(raw.tab))
}

const DEFAULTS = Object.freeze({ language: DEFAULT_LANGUAGE, libraryPath: null, showDeveloperInfo: false, libraryRoot: null, setupConnection: null, sourceContact: null })
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

/**
 * 首次打开's connection record (v2 package I): exactly { by, at, detail? } with by one of SETUP_BY, at an ISO time (UTC, as
 * Date#toISOString writes it) and detail, when there, a string of at most 100 characters; anything else is null.
 */
export function setupConnectionOf(raw) {
  if (!isObject(raw)) return null
  if (!Object.keys(raw).every(k => k === 'by' || k === 'at' || k === 'detail')) return null
  if (!SETUP_BY.includes(raw.by)) return null
  if (typeof raw.at !== 'string' || !ISO_TIME.test(raw.at) || Number.isNaN(Date.parse(raw.at))) return null
  if (raw.detail !== undefined && (typeof raw.detail !== 'string' || raw.detail.length > 100)) return null
  return raw.detail === undefined ? { by: raw.by, at: raw.at } : { by: raw.by, at: raw.at, detail: raw.detail }
}

/** A model slot: a non-empty string id, or null (the default). Anything else is null. */
function modelOf(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * The connection settings, each field checked on its own: a bad field is its default, the good ones stay.
 * @param {unknown} raw
 */
export function normalizeConnections(raw) {
  const d = defaultConnections()
  if (!isObject(raw)) return d
  const active = own(raw, 'active')
  const out = { active: CONNECTION_KINDS.includes(active) ? active : null }
  for (const kind of ['claude-code', 'codex']) {
    const c = own(raw, kind)
    out[kind] = { model: modelOf(own(c, 'model')), verifyModel: modelOf(own(c, 'verifyModel')) }
  }
  const api = own(raw, 'api')
  const vendor = own(api, 'vendor')
  const baseUrl = own(api, 'baseUrl')
  out.api = {
    vendor: VENDOR_IDS.includes(vendor) ? vendor : d.api.vendor,
    baseUrl: typeof baseUrl === 'string' && HTTP_URL.test(baseUrl.trim()) ? baseUrl.trim() : null,
    model: modelOf(own(api, 'model')),
    verifyModel: modelOf(own(api, 'verifyModel')),
  }
  return out
}

/** The schedule, each field checked on its own: a bad field is its default ({ enabled: true, time: '08:30' }). */
export function normalizeSchedule(raw) {
  const enabled = own(raw, 'enabled')
  const time = own(raw, 'time')
  return { enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SCHEDULE.enabled, time: isScheduleTime(time) ? time : DEFAULT_SCHEDULE.time }
}

/** Is `raw` exactly { enabled: boolean, time: 'HH:MM' } and nothing else? */
export function isSchedule(raw) {
  return isObject(raw) && Object.keys(raw).every(k => k === 'enabled' || k === 'time') && typeof raw.enabled === 'boolean' && isScheduleTime(raw.time)
}

/** The recent list: absolute paths only, no repeats (letter case does not count on Windows), at most RECENT_MAX. */
export function normalizeRecent(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const p of raw) {
    if (typeof p !== 'string' || !isAbsolute(p)) continue
    const key = process.platform === 'win32' ? p.toLowerCase() : p
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length === RECENT_MAX) break
  }
  return out
}

/** `path` put first in the recent list (moved there when already in it), the list cut to RECENT_MAX. */
export function withRecent(list, path) {
  return normalizeRecent([path, ...normalizeRecent(list)])
}

/** The settings in `file`, each field checked; a missing or broken file gives the defaults. */
export function readSettings(file) {
  let data = null
  try { data = JSON.parse(readFileSync(file, 'utf8')) } catch { data = null }
  const language = own(data, 'language')
  const library = own(data, 'libraryPath')
  const root = own(data, 'libraryRoot')
  return {
    language: LANGUAGE_SETTINGS.includes(language) ? language : DEFAULTS.language,
    libraryPath: typeof library === 'string' && isAbsolute(library) ? library : DEFAULTS.libraryPath,
    recentLibraries: normalizeRecent(own(data, 'recentLibraries')),
    connections: normalizeConnections(own(data, 'connections')),
    showDeveloperInfo: own(data, 'showDeveloperInfo') === true,
    schedule: normalizeSchedule(own(data, 'schedule')),
    // the theme and the appearance, older ids migrated (theme.mjs migrateLook, redesign R1); only these two fields
    ...migrateLook(own(data, 'theme'), own(data, 'appearance')),
    libraryRoot: typeof root === 'string' && isAbsolute(root) ? root : DEFAULTS.libraryRoot,
    setupConnection: setupConnectionOf(own(data, 'setupConnection')),
    // v2 package L: the right panel (open or folded, its tab), remembered for the next start
    panel: normalizePanel(own(data, 'panel')),
    // 1.1.1 P9 (B24): 来源授权's contact e-mail, or null
    sourceContact: isContact(own(data, 'sourceContact')) ? own(data, 'sourceContact').trim() : DEFAULTS.sourceContact,
  }
}

/** Is `raw` exactly a connections object that normalizes to itself (so a write stores what was asked, no silent repair)? */
function checkConnections(raw) {
  if (!isObject(raw)) return false
  const norm = normalizeConnections(raw)
  for (const kind of CONNECTION_KINDS) {
    const c = own(raw, kind)
    if (!isObject(c)) return false
    for (const [k, v] of Object.entries(norm[kind])) if (own(c, k) !== v) return false
    for (const k of Object.keys(c)) if (!Object.hasOwn(norm[kind], k)) return false
  }
  if (own(raw, 'active') !== norm.active) return false
  for (const k of Object.keys(raw)) if (!Object.hasOwn(norm, k)) return false
  return true
}

/**
 * Change some settings and write them all.
 * @param {string} file
 * @param {{language?: string, libraryPath?: string|null, recentLibraries?: string[], connections?: object, showDeveloperInfo?: boolean, schedule?: {enabled: boolean, time: string}, theme?: string, appearance?: string, libraryRoot?: string|null, setupConnection?: {by: string, at: string, detail?: string}|null, panel?: {open?: boolean, tab?: string}}} patch
 * @returns {object} the settings now
 */
export function writeSettings(file, patch) {
  const next = { ...readSettings(file) }
  if (Object.hasOwn(patch, 'language')) {
    if (!LANGUAGE_SETTINGS.includes(patch.language)) throw new TypeError(`no language ${patch.language}`)
    next.language = patch.language
  }
  if (Object.hasOwn(patch, 'libraryPath')) {
    if (patch.libraryPath !== null && (typeof patch.libraryPath !== 'string' || !isAbsolute(patch.libraryPath))) throw new TypeError('libraryPath must be an absolute path, or null')
    next.libraryPath = patch.libraryPath
  }
  if (Object.hasOwn(patch, 'recentLibraries')) {
    const list = patch.recentLibraries
    if (!Array.isArray(list) || list.some(p => typeof p !== 'string' || !isAbsolute(p))) throw new TypeError('recentLibraries must be a list of absolute paths')
    next.recentLibraries = normalizeRecent(list)
  }
  if (Object.hasOwn(patch, 'connections')) {
    if (!checkConnections(patch.connections)) throw new TypeError('connections must be a complete, valid connections object')
    next.connections = normalizeConnections(patch.connections)
  }
  if (Object.hasOwn(patch, 'showDeveloperInfo')) next.showDeveloperInfo = patch.showDeveloperInfo === true
  if (Object.hasOwn(patch, 'schedule')) {
    if (!isSchedule(patch.schedule)) throw new TypeError("schedule must be { enabled: boolean, time: 'HH:MM' } (00:00–23:59)")
    next.schedule = { enabled: patch.schedule.enabled, time: patch.schedule.time }
  }
  if (Object.hasOwn(patch, 'theme')) {
    if (!isThemeId(patch.theme)) throw new TypeError(`no theme ${patch.theme}`)
    next.theme = patch.theme
  }
  // v2 package K2: the appearance (light · dark · system)
  if (Object.hasOwn(patch, 'appearance')) {
    if (!isAppearance(patch.appearance)) throw new TypeError(`no appearance ${patch.appearance}`)
    next.appearance = patch.appearance
  }
  if (Object.hasOwn(patch, 'libraryRoot')) {
    if (patch.libraryRoot !== null && (typeof patch.libraryRoot !== 'string' || !isAbsolute(patch.libraryRoot))) throw new TypeError('libraryRoot must be an absolute path, or null')
    next.libraryRoot = patch.libraryRoot
  }
  if (Object.hasOwn(patch, 'setupConnection')) {
    const v = patch.setupConnection === null ? null : setupConnectionOf(patch.setupConnection)
    if (patch.setupConnection !== null && v === null) throw new TypeError('setupConnection must be { by, at, detail? }, or null')
    next.setupConnection = v
  }
  // 1.1.1 P9 (B24): the contact e-mail of 来源授权, or null to clear it
  if (Object.hasOwn(patch, 'sourceContact')) {
    if (patch.sourceContact !== null && !isContact(patch.sourceContact)) throw new TypeError('sourceContact must be an e-mail address, or null')
    next.sourceContact = patch.sourceContact === null ? null : patch.sourceContact.trim()
  }
  // v2 package L: the right panel — the fields given change, the other stays
  if (Object.hasOwn(patch, 'panel')) {
    if (!isPanelPatch(patch.panel)) throw new TypeError(`panel must be { open?: boolean, tab?: ${PANEL_TABS.join(' | ')} }`)
    next.panel = normalizePanel({ ...next.panel, ...patch.panel })
  }
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ schema: SETTINGS_SCHEMA, ...next }, null, 2)}\n`)
  renameSync(tmp, file)
  return next
}
