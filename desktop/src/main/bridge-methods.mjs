/**
 * The bridge between the page and the main process: every method the page may call, by name.
 *
 * Exactly these names are exposed by the preload (src/preload/preload.cjs `METHODS`) and listed in
 * docs/desktop.md §四 — test/bridge.test.mjs checks the three agree, and the running page is checked to
 * have exactly the documented ones (test/security.test.mjs). Adding a method: docs/desktop.md §四.
 *
 * Every call answers with an envelope, never a thrown error: `{ ok: true, data }` or
 * `{ ok: false, error: { code } }` (codes in ERROR_CODES; the page puts them in words). Pure: no Electron here,
 * so the table can be tested in plain Node; bridge.mjs registers it with ipcMain.
 * @module desktop/main/bridge-methods
 */

import { LANGUAGE_SETTINGS } from './locale.mjs'
import { isAppearance, isThemeId } from '../shared/themes.mjs'
import { isPanelPatch } from './settings.mjs'

export const CHANNEL_PREFIX = 'streams:'

const KINDS = ['claude-code', 'codex', 'api']
const isString = v => typeof v === 'string'
const nonEmpty = v => typeof v === 'string' && v.trim() !== ''
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const stringOrNull = v => v === null || typeof v === 'string'

// interface B (docs/desktop.md §4.2): the views, the bounds of what the page may send. Redesign R3: 'all' (资料库 「全部」: every
// file of the library); 'pending' is 缺少文件头's page (1.1 W7b: v1.0's 'caught' went with its scoring pipeline)
const LIBRARY_VIEWS = ['kept', 'authored', 'pending', 'all']
const SEARCH_VIEWS = ['kept', 'authored', 'all']
const shortString = max => v => typeof v === 'string' && v.length <= max
const nonEmptyShort = max => v => nonEmpty(v) && v.length <= max
const name100 = nonEmptyShort(100)
const id200 = nonEmptyShort(200)
const url2000 = nonEmptyShort(2000)
const httpUrl = v => url2000(v) && /^https?:\/\/\S+$/i.test(v.trim())
const strings = (v, { items = 50, max = 100 } = {}) => Array.isArray(v) && v.length <= items && v.every(x => typeof x === 'string' && x.length <= max)
const days = v => v === null || (Number.isInteger(v) && v > 0 && v <= 36500)
const onlyKeys = (o, keys) => Object.keys(o).every(k => keys.includes(k))
/** A plain object the page built (JSON-sized): no functions, no cycles, at most `max` characters once written out. */
const smallObject = (v, max = 20_000) => {
  if (!isObject(v)) return false
  try { const text = JSON.stringify(v); return typeof text === 'string' && text.length <= max } catch { return false }
}
const optional = (o, key, check) => o[key] === undefined || check(o[key])
// 1.1 W6b: an answer to the build agent — words, or the options picked (at most 4) and what was typed beside 「其它」
const buildAnswer = a => (typeof a === 'string' && a.trim() !== '' && a.length <= 4000)
  || (isObject(a) && onlyKeys(a, ['picked', 'other']) && Array.isArray(a.picked) && a.picked.length <= 4 && a.picked.every(p => typeof p === 'string' && p.length <= 500)
    && optional(a, 'other', v => typeof v === 'string' && v.length <= 2000))
/** { topics?, days? } — the filter of getLibrary; null is the same as {} */
const libraryFilter = f => f === null || (isObject(f) && onlyKeys(f, ['topics', 'days']) && optional(f, 'topics', strings) && optional(f, 'days', days))
const searchFilter = f => f === null || (isObject(f) && onlyKeys(f, ['view', 'topics', 'days']) && optional(f, 'view', v => SEARCH_VIEWS.includes(v)) && optional(f, 'topics', strings) && optional(f, 'days', days))
// redesign R3 (维护者 11-11 第 9 题, F40): the graph has one filter left, the time range; 只看已收藏 / 全部条目 and 显示 [[链接]] are gone
const graphFilter = f => f === null || (isObject(f) && onlyKeys(f, ['days']) && optional(f, 'days', days))
/** { title?, topics?, body? }, at least one of them */
const noteChanges = c => isObject(c) && Object.keys(c).length > 0 && onlyKeys(c, ['title', 'topics', 'body'])
  && optional(c, 'title', nonEmptyShort(300)) && optional(c, 'topics', v => strings(v, { items: 20, max: 100 }) && v.every(nonEmpty)) && optional(c, 'body', shortString(1_000_000))
const question = v => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 500
// v2 package A: a library's registry id (whether it is one is the library service's to say: an unknown one is bad_arguments)
const libraryId = nonEmptyShort(40)
const schedule = s => isObject(s) && onlyKeys(s, ['enabled', 'time']) && typeof s.enabled === 'boolean' && typeof s.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)
// 1.1.1 P11a (A10): a library's schedule says how often too — every / days / day (the core's isSchedule judges the values)
const librarySchedule = s => isObject(s) && onlyKeys(s, ['enabled', 'time', 'every', 'days', 'day']) && typeof s.enabled === 'boolean' && typeof s.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)
  && (s.every === undefined || typeof s.every === 'string') && (s.day === undefined || Number.isInteger(s.day)) && (s.days === undefined || (Array.isArray(s.days) && s.days.length <= 7 && s.days.every(Number.isInteger)))
/** { name?, icon?, color? }, at least one, each a string (the core's withMeta judges the values) */
const libraryMeta = m => isObject(m) && Object.keys(m).length > 0 && onlyKeys(m, ['name', 'icon', 'color']) && Object.values(m).every(v => typeof v === 'string' && v.length <= 200)
// a trailing argument the page may leave out is `undefined` (or null)
const absent = v => v === undefined || v === null
// redesign R2: the quick reasons of the 放弃 bar (the core's DISMISS_QUICK)
const DISMISS_QUICK_IDS = Object.freeze(['marketing', 'irrelevant', 'shallow', 'duplicate'])

/** name → how many arguments it takes, and a check for them. */
export const BRIDGE_METHODS = Object.freeze({
  // the shell (app-services.mjs): what the page needs to draw itself, and the settings page
  getAppState: Object.freeze({ args: 0 }),
  // the language of the app's own words (locale.mjs; docs/desktop.md§六): the setting, not a locale
  setLanguage: Object.freeze({ args: 1, check: ([v]) => LANGUAGE_SETTINGS.includes(v) }),
  // the app's look (theme.mjs; docs/desktop.md §五「主题」): one of the four ids (redesign R1)
  setTheme: Object.freeze({ args: 1, check: ([id]) => isThemeId(id) }),
  // v2 package K2: light · dark · system
  setAppearance: Object.freeze({ args: 1, check: ([a]) => isAppearance(a) }),
  setShowDeveloperInfo: Object.freeze({ args: 1, check: ([on]) => typeof on === 'boolean' }),
  // v2 package L: the right panel folded / unfolded or another tab — { open?: boolean, tab?: progress|decide|detail|files }
  setPanel: Object.freeze({ args: 1, check: ([p]) => isPanelPatch(p) }),
  copyDiagnostics: Object.freeze({ args: 0 }),
  // the about part's 「由 Starry Digital 开发」: opens the maker's site (a fixed address; the page gives none)
  openMakerPage: Object.freeze({ args: 0 }),
  // 许可证与致谢 (S14): Streams' own license, the parts that ship with it; the install's full notices (a fixed file, no path from the page)
  getLicenses: Object.freeze({ args: 0 }),
  openNotices: Object.freeze({ args: 0 }),
  // the update (docs/desktop.md§四, update-wiring.mjs): the state, a check now, the download and its cancel, the setup
  // program started (the app then quits), the release's page in the user's browser — no address or file name from the page
  getUpdateState: Object.freeze({ args: 0 }),
  checkForUpdate: Object.freeze({ args: 0 }),
  downloadUpdate: Object.freeze({ args: 0 }),
  cancelUpdateDownload: Object.freeze({ args: 0 }),
  installUpdate: Object.freeze({ args: 0 }),
  openReleasePage: Object.freeze({ args: 0 }),
  // the library (services/library.mjs): the folder comes from the dialog and stays in the main process; the page sends
  // a name, or a path that must already be in the recent list
  chooseLibraryFolder: Object.freeze({ args: 0 }),
  useChosenFolder: Object.freeze({ args: 1, check: ([name]) => isString(name) }),
  openRecentLibrary: Object.freeze({ args: 1, check: ([path]) => nonEmpty(path) }),
  rebuildIndex: Object.freeze({ args: 0 }),
  revealLibrary: Object.freeze({ args: 0 }),
  // 1.1.1 P11a (A11): 库架's 「更多 → 在资源管理器中显示」 for any registered library, not only the current one
  revealLibraryOf: Object.freeze({ args: 1, check: ([id]) => libraryId(id) }),
  // 首次设置 records who decided each step (plan A1): the step and { by, detail? } are the core's to judge (bad-setup)
  recordSetupStep: Object.freeze({ args: 2, check: ([step, entry]) => nonEmptyShort(40)(step) && smallObject(entry, 4000) }),
  getSetup: Object.freeze({ args: 0 }),
  // the connections (services/connections.mjs): a kind, model ids, a vendor; the key goes in once and never comes back
  getConnections: Object.freeze({ args: 0 }),
  detectConnections: Object.freeze({ args: 0 }),
  probeConnection: Object.freeze({ args: 1, check: ([kind]) => KINDS.includes(kind) }),
  openLogin: Object.freeze({ args: 1, check: ([kind]) => kind === 'claude-code' || kind === 'codex' }),
  setActiveConnection: Object.freeze({ args: 1, check: ([kind]) => kind === null || KINDS.includes(kind) }),
  setConnectionModels: Object.freeze({ args: 2, check: ([kind, models]) => KINDS.includes(kind) && isObject(models) && stringOrNull(models.model) && stringOrNull(models.verifyModel) }),
  setApiVendor: Object.freeze({ args: 2, check: ([vendor, baseUrl]) => nonEmpty(vendor) && stringOrNull(baseUrl) }),
  setApiKey: Object.freeze({ args: 2, check: ([vendor, key]) => nonEmpty(vendor) && nonEmpty(key) }),
  removeApiKey: Object.freeze({ args: 1, check: ([vendor]) => nonEmpty(vendor) }),
  // the run and 待看 (services/pipeline.mjs): the numbers, one run, the inbox and its decisions
  getHome: Object.freeze({ args: 0 }),
  startRound: Object.freeze({ args: 0 }),
  cancelRound: Object.freeze({ args: 0 }),
  getRoundState: Object.freeze({ args: 0 }),
  getInbox: Object.freeze({ args: 0 }),
  keepItem: Object.freeze({ args: 1, check: ([url]) => nonEmpty(url) }),
  // redesign R2 (N03): 放弃 is held until its bar closes — settleDismiss writes it (a reason in words up to 300 characters, a
  // quick id, or neither), undoDismiss drops it
  dismissItem: Object.freeze({ args: 1, check: ([url]) => nonEmpty(url) }),
  settleDismiss: Object.freeze({ args: 2, check: ([reason, quick]) => (absent(reason) || shortString(300)(reason)) && (absent(quick) || DISMISS_QUICK_IDS.includes(quick)) }),
  undoDismiss: Object.freeze({ args: 0 }),
  laterItem: Object.freeze({ args: 1, check: ([url]) => nonEmpty(url) }),
  openItemUrl: Object.freeze({ args: 1, check: ([url]) => nonEmpty(url) }),
  // the timed round (services/schedule.mjs; docs/desktop.md §4.3): { enabled, time: 'HH:MM' } with 00:00–23:59, nothing else
  getSchedule: Object.freeze({ args: 0 }),
  setSchedule: Object.freeze({ args: 1, check: ([s]) => schedule(s) }),
  // v2 package L: the one queue of every library — the round that runs, the libraries waiting (why, since), the next slots
  getQueue: Object.freeze({ args: 0 }),
  // the libraries the app knows (v2 package A; services/library.mjs, services/schedule.mjs; docs/desktop.md §4.4): every
  // method above works on the current library; these name one by its registry id. addLibrary takes only the folder the
  // last chooseLibraryFolder gave
  listLibraries: Object.freeze({ args: 0 }),
  setActiveLibrary: Object.freeze({ args: 1, check: ([id]) => libraryId(id) }),
  addLibrary: Object.freeze({ args: 1, check: ([path]) => nonEmptyShort(2000)(path) }),
  removeLibrary: Object.freeze({ args: 1, check: ([id]) => libraryId(id) }),
  setLibraryMeta: Object.freeze({ args: 2, check: ([id, meta]) => libraryId(id) && libraryMeta(meta) }),
  getLibrariesOverview: Object.freeze({ args: 0 }),
  getLibrarySchedule: Object.freeze({ args: 1, check: ([id]) => libraryId(id) }),
  setLibrarySchedule: Object.freeze({ args: 2, check: ([id, s]) => libraryId(id) && librarySchedule(s) }),
  getUsageTotal: Object.freeze({ args: 0 }),
  // 新建库默认放在 (v2 package I; services/library.mjs): the folder and whether it is the default; the system's dialog; a path
  // or null (= the default). The page's path is judged by the service: absolute, not inside the app data (else bad_arguments)
  getLibraryRoot: Object.freeze({ args: 0 }),
  chooseLibraryRoot: Object.freeze({ args: 0 }),
  setLibraryRoot: Object.freeze({ args: 1, check: ([path]) => path === null || nonEmptyShort(2000)(path) }),
  // 来源与要求's 高级设置: 变更记录 (services/sources.mjs; docs/desktop.md §4.17; read only)
  getChangeLog: Object.freeze({ args: 0 }),
  // interface B (docs/desktop.md §4.2). The library and reading (services/browse.mjs): an id must be in the index
  getLibrary: Object.freeze({ args: 2, check: ([view, filter]) => LIBRARY_VIEWS.includes(view) && libraryFilter(filter) }),
  searchLibrary: Object.freeze({ args: 2, check: ([q, filter]) => shortString(200)(q) && searchFilter(filter) }),
  readNote: Object.freeze({ args: 1, check: ([id]) => id200(id) }),
  editNote: Object.freeze({ args: 2, check: ([id, changes]) => id200(id) && noteChanges(changes) }),
  openInObsidian: Object.freeze({ args: 1, check: ([id]) => id200(id) }),
  // v2 package H (docs/desktop.md §4.9): a note's file in the file manager (an id of the index; the path is the core's);
  // 「打开原文」 in the reading window or the system browser (an http(s) item of the library)
  showNoteInFolder: Object.freeze({ args: 1, check: ([id]) => id200(id) }),
  // v2 package L: the right panel's 「文件」 — the current library told as a structure (read only); its program records' folder
  // in the file manager (nothing in it is listed or opened)
  getLibraryOutline: Object.freeze({ args: 0 }),
  revealProgramRecords: Object.freeze({ args: 0 }),
  // 1.1 W6a (A4): a third argument, the summary's point (0-based) the reading window opens on
  openReader: Object.freeze({ args: 3, optional: 1, check: ([url, how, point]) => httpUrl(url) && (how === 'reader' || how === 'browser') && (point === undefined || (Number.isInteger(point) && point >= 0 && point < 20)) }),
  // 待规范 (docs/desktop.md §4.3, S8): a file name the core lists as needing a header; the header the page edited, or null
  applyHeader: Object.freeze({ args: 2, check: ([file, header]) => nonEmptyShort(300)(file) && (header === null || smallObject(header, 20_000)) }),
  applyAllHeaders: Object.freeze({ args: 0 }),
  // a library's sources with their last fetch (services/sources.mjs; read only: 1.1 W7b — a library made by the last version
  // lists them, a library with a card has getCardView)
  getSources: Object.freeze({ args: 0 }),
  // 1.1 W6a: a library's card and its sources' rows; a source typed by the user, held until 确认
  getCardView: Object.freeze({ args: 0 }),
  proposeCardSource: Object.freeze({ args: 1, check: ([t]) => typeof t === 'string' && t.trim() !== '' && t.length <= 2000 }),
  settleCardSource: Object.freeze({ args: 2, check: ([id, yes]) => typeof id === 'string' && id.length <= 80 && typeof yes === 'boolean' }),
  // 1.1 W6b: the build conversation (services/build.mjs); a library id to change that library's card
  getBuild: Object.freeze({ args: 0 }),
  startBuild: Object.freeze({ args: 2, optional: 1, check: ([t, id]) => typeof t === 'string' && t.trim() !== '' && t.length <= 2000 && (id === undefined || id === null || libraryId(id)) }),
  replyBuild: Object.freeze({ args: 1, check: ([a]) => buildAnswer(a) }),
  retryBuild: Object.freeze({ args: 0 }),
  confirmBuild: Object.freeze({ args: 0 }),
  dropBuild: Object.freeze({ args: 0 }),
  // the run-log folder, the graph, the verdicts (services/status.mjs)
  openLogsFolder: Object.freeze({ args: 0 }),
  getGraph: Object.freeze({ args: 1, check: ([filter]) => graphFilter(filter) }),
  getVerdicts: Object.freeze({ args: 1, check: ([url]) => url2000(url) }),
  // asking the library (services/ask.mjs): one question at a time
  askLibrary: Object.freeze({ args: 1, check: ([q]) => question(q) }),
  getDemands: Object.freeze({ args: 0 }),
  addDemand: Object.freeze({ args: 2, check: ([topic, q]) => name100(topic) && shortString(500)(q) }),
  answerFeedback: Object.freeze({ args: 2, check: ([q, note]) => nonEmptyShort(500)(q) && nonEmptyShort(2000)(note) }),
  // v2 package M (services/quota.mjs; docs/desktop.md §4.11): the current connection's plan windows or API balance, or null
  getQuota: Object.freeze({ args: 0 }),
})

export const ERROR_CODES = Object.freeze([
  'refused', // the call did not come from the app's own page (bridge.mjs)
  'bad_arguments', // wrong number or kind of arguments
  'no_library', // no library folder opened yet
  'open_failed', // the system could not open the folder or the address
  'no_connection', // a method that calls a model (askLibrary) with no connection chosen
  'internal', // anything else; the details go to the app's log, not to the page
])

export class BridgeError extends Error {
  constructor(code, message = code) {
    super(message)
    this.code = ERROR_CODES.includes(code) ? code : 'internal'
  }
}

/**
 * The core's error codes (StreamsError.code) that mean "what the page sent does not fit": they become bad_arguments.
 * Every other code, and an error without one, becomes internal (the details only in the app's log).
 */
export const CORE_BAD_ARGUMENT_CODES = Object.freeze([
  'bad-argument', 'bad-edit', 'invalid-note', 'not-editable', 'bad-source', 'bad-topic', 'bad-input', 'bad-url',
  'bad-feedback', 'bad-question', 'bad-view', 'not-found',
  // writing a header onto a file of an imported folder (core-api 5.9)
  'not-proposable', 'bad-file-name', 'already-conforming', 'bad-id',
  // a step of 首次设置 recorded with an unknown step or `by` (core recordSetupStep)
  'bad-setup',
  // a library id the registry does not hold (core withActive / withMeta / withoutLibrary; v2 package A)
  'unknown-library',
])

/** A core error as the bridge's: shape errors (and every `duplicate-*`) → bad_arguments, the rest → internal. */
export function bridgeErrorOf(err) {
  if (err instanceof BridgeError) return err
  const code = typeof err?.code === 'string' ? err.code : null
  const bad = code !== null && (CORE_BAD_ARGUMENT_CODES.includes(code) || code.startsWith('duplicate-'))
  return new BridgeError(bad ? 'bad_arguments' : 'internal', `core ${code ?? 'error'}: ${String(err?.stack ?? err)}`)
}

/**
 * Calls into the core by name, its errors mapped by bridgeErrorOf (a promise's rejection too). A function the core
 * does not have (yet) is `internal`, said in the log by name.
 * @param {Record<string, unknown>} core - the core's exports (main/core.mjs), or a stand-in in the tests
 * @returns {(name: string, ...args: unknown[]) => unknown}
 */
export function coreCaller(core) {
  return (name, ...args) => {
    const fn = core[name]
    if (typeof fn !== 'function') throw new BridgeError('internal', `the core has no function ${name}`)
    let r
    try { r = fn(...args) } catch (err) { throw bridgeErrorOf(err) }
    return r !== null && typeof r?.then === 'function' ? r.then(v => v, err => { throw bridgeErrorOf(err) }) : r
  }
}

export const channelOf = name => `${CHANNEL_PREFIX}${name}`

export function methodNames() {
  return Object.keys(BRIDGE_METHODS)
}

/** @throws {BridgeError} bad_arguments */
export function checkArgs(name, args) {
  const spec = Object.hasOwn(BRIDGE_METHODS, name) ? BRIDGE_METHODS[name] : null
  if (!spec) throw new BridgeError('internal', `no bridge method ${name}`)
  const fewest = spec.args - (Number.isInteger(spec.optional) ? spec.optional : 0)
  if (!Array.isArray(args) || args.length > spec.args || args.length < fewest) throw new BridgeError('bad_arguments')
  if (typeof spec.check === 'function' && spec.check(args) !== true) throw new BridgeError('bad_arguments')
}

/**
 * Run one handler and wrap what it gives in the envelope.
 * @param {string} name
 * @param {Function} handler
 * @param {unknown[]} args
 * @param {(line: string) => void} [log]
 */
export async function runHandler(name, handler, args, log = () => {}) {
  try {
    checkArgs(name, args)
    return { ok: true, data: await handler(...args) }
  } catch (err) {
    const code = err instanceof BridgeError ? err.code : 'internal'
    log(`bridge ${name}: ${code}: ${String(err?.stack ?? err)}`)
    return { ok: false, error: { code } }
  }
}

/**
 * The handlers must be exactly the table's methods: a handler without an entry (or an entry without a
 * handler) stops the app at start, before any window opens.
 */
export function assertHandlers(handlers) {
  const want = methodNames().sort()
  const got = Object.keys(handlers).sort()
  if (want.join() !== got.join()) throw new Error(`bridge handlers ${JSON.stringify(got)} do not match BRIDGE_METHODS ${JSON.stringify(want)}`)
  for (const name of want) if (typeof handlers[name] !== 'function') throw new Error(`bridge handler ${name} is not a function`)
}
