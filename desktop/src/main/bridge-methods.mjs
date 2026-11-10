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

// interface B (docs/desktop.md §4.2): the views, the bounds of what the page may send
const LIBRARY_VIEWS = ['kept', 'authored', 'caught', 'pending']
const SEARCH_VIEWS = ['kept', 'authored', 'all']
const GRAPH_STATUSES = ['kept', 'all']
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
/** { topics?, days? } — the filter of getLibrary; null is the same as {} */
const libraryFilter = f => f === null || (isObject(f) && onlyKeys(f, ['topics', 'days']) && optional(f, 'topics', strings) && optional(f, 'days', days))
const searchFilter = f => f === null || (isObject(f) && onlyKeys(f, ['view', 'topics', 'days']) && optional(f, 'view', v => SEARCH_VIEWS.includes(v)) && optional(f, 'topics', strings) && optional(f, 'days', days))
const graphFilter = f => f === null || (isObject(f) && onlyKeys(f, ['days', 'status', 'topics', 'links']) && optional(f, 'days', days) && optional(f, 'status', v => GRAPH_STATUSES.includes(v)) && optional(f, 'topics', strings) && optional(f, 'links', v => typeof v === 'boolean'))
/** { title?, topics?, body? }, at least one of them */
const noteChanges = c => isObject(c) && Object.keys(c).length > 0 && onlyKeys(c, ['title', 'topics', 'body'])
  && optional(c, 'title', nonEmptyShort(300)) && optional(c, 'topics', v => strings(v, { items: 20, max: 100 }) && v.every(nonEmpty)) && optional(c, 'body', shortString(1_000_000))
const question = v => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 500
// v2 package A: a library's registry id (whether it is one is the library service's to say: an unknown one is bad_arguments)
const libraryId = nonEmptyShort(40)
const schedule = s => isObject(s) && onlyKeys(s, ['enabled', 'time']) && typeof s.enabled === 'boolean' && typeof s.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)
/** { name?, icon?, color? }, at least one, each a string (the core's withMeta judges the values) */
// v2 package B: a proposal card's id, the filter of listProposals, the statuses a card has (core PROPOSAL_STATUSES)
export const PROPOSAL_STATUSES = Object.freeze(['pending', 'confirmed', 'declined', 'revise', 'stale', 'failed'])
const proposalId = nonEmptyShort(80)
const proposalFilter = f => f === null || (isObject(f) && onlyKeys(f, ['status', 'libraryId']) && optional(f, 'status', v => PROPOSAL_STATUSES.includes(v)) && optional(f, 'libraryId', v => v === null || libraryId(v)))
const libraryMeta = m => isObject(m) && Object.keys(m).length > 0 && onlyKeys(m, ['name', 'icon', 'color']) && Object.values(m).every(v => typeof v === 'string' && v.length <= 200)
// v2 package C: the main agent and the suggestion cards. A trailing argument the page may leave out is `undefined` (or null)
const absent = v => v === undefined || v === null
const agentText = v => nonEmpty(v) && [...v.trim()].length <= 4000
const agentSendOptions = o => absent(o) || (isObject(o) && onlyKeys(o, ['libraryId']) && optional(o, 'libraryId', v => v === null || libraryId(v)))
const transcriptQuery = q => absent(q) || (isObject(q) && onlyKeys(q, ['limit', 'before'])
  && optional(q, 'limit', v => Number.isInteger(v) && v >= 1 && v <= 500) && optional(q, 'before', v => v === null || (Number.isInteger(v) && v >= 1)))
const suggestionFilter = f => absent(f) || (isObject(f) && onlyKeys(f, ['libraryId']) && optional(f, 'libraryId', v => v === null || libraryId(v)))
const suggestionKey = nonEmptyShort(300)

/** name → how many arguments it takes, and a check for them. */
export const BRIDGE_METHODS = Object.freeze({
  // the shell (app-services.mjs): what the page needs to draw itself, and the settings page
  getAppState: Object.freeze({ args: 0 }),
  // the language of the app's own words (locale.mjs; docs/desktop.md§六): the setting, not a locale
  setLanguage: Object.freeze({ args: 1, check: ([v]) => LANGUAGE_SETTINGS.includes(v) }),
  // the app's look (theme.mjs; docs/desktop.md §五「主题」): one of the three ids
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
  // the pipeline (services/pipeline.mjs): the first run's pack, the numbers, one round, the inbox and its decisions
  applyStarterPack: Object.freeze({ args: 2, check: ([packId, edits]) => nonEmpty(packId) && (edits === null || edits === undefined || isObject(edits)) }),
  getStarterPacks: Object.freeze({ args: 0 }),
  getHome: Object.freeze({ args: 0 }),
  estimateRound: Object.freeze({ args: 0 }),
  setRoundCap: Object.freeze({ args: 1, check: ([cap]) => Number.isInteger(cap) && cap > 0 }),
  startRound: Object.freeze({ args: 0 }),
  cancelRound: Object.freeze({ args: 0 }),
  getRoundState: Object.freeze({ args: 0 }),
  getInbox: Object.freeze({ args: 0 }),
  keepItem: Object.freeze({ args: 1, check: ([url]) => nonEmpty(url) }),
  dismissItem: Object.freeze({ args: 2, check: ([url, reason]) => nonEmpty(url) && nonEmpty(reason) }),
  laterItem: Object.freeze({ args: 1, check: ([url]) => nonEmpty(url) }),
  openItemUrl: Object.freeze({ args: 1, check: ([url]) => nonEmpty(url) }),
  getPipelineSettings: Object.freeze({ args: 0 }),
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
  setLibrarySchedule: Object.freeze({ args: 2, check: ([id, s]) => libraryId(id) && schedule(s) }),
  getUsageTotal: Object.freeze({ args: 0 }),
  // 新建库默认放在 (v2 package I; services/library.mjs): the folder and whether it is the default; the system's dialog; a path
  // or null (= the default). The page's path is judged by the service: absolute, not inside the app data (else bad_arguments)
  getLibraryRoot: Object.freeze({ args: 0 }),
  chooseLibraryRoot: Object.freeze({ args: 0 }),
  setLibraryRoot: Object.freeze({ args: 1, check: ([path]) => path === null || nonEmptyShort(2000)(path) }),
  // the proposal cards (v2 package B; services/proposals.mjs; docs/desktop.md §4.5): the list, the three answers — only
  // confirmProposal changes anything, and only for a pending card — and 「谁定的」 of the current library
  listProposals: Object.freeze({ args: 1, check: ([filter]) => proposalFilter(filter) }),
  confirmProposal: Object.freeze({ args: 1, check: ([id]) => proposalId(id) }),
  declineProposal: Object.freeze({ args: 1, check: ([id]) => proposalId(id) }),
  reviseProposal: Object.freeze({ args: 2, check: ([id, text]) => proposalId(id) && nonEmptyShort(2000)(text) }),
  getWhoDecided: Object.freeze({ args: 0 }),
  // the main agent (v2 package C; services/agent.mjs; docs/desktop.md §4.6): one sentence → one turn (one at a time: a second
  // waits for the first); the conversation's record; the state. `optional` = how many trailing arguments may be left out
  agentSend: Object.freeze({ args: 2, optional: 1, check: ([text, o]) => agentText(text) && agentSendOptions(o) }),
  getAgentTranscript: Object.freeze({ args: 1, optional: 1, check: ([q]) => transcriptQuery(q) }),
  getAgentStatus: Object.freeze({ args: 0 }),
  // the suggestion cards (v2 package D's, wired by package C): the open ones; 「不要」; 「要」 = recorded and handed to the main
  // agent as a note for one turn (it decides whether to propose a card) — nothing else changes
  listSuggestions: Object.freeze({ args: 1, optional: 1, check: ([f]) => suggestionFilter(f) }),
  dismissSuggestion: Object.freeze({ args: 3, optional: 1, check: ([id, key, reason]) => libraryId(id) && suggestionKey(key) && (absent(reason) || shortString(500)(reason)) }),
  acceptSuggestion: Object.freeze({ args: 2, check: ([id, key]) => libraryId(id) && suggestionKey(key) }),
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
  openReader: Object.freeze({ args: 2, check: ([url, how]) => httpUrl(url) && (how === 'reader' || how === 'browser') }),
  // 待规范 (docs/desktop.md §4.3, S8): a file name the core lists as needing a header; the header the page edited, or null
  applyHeader: Object.freeze({ args: 2, check: ([file, header]) => nonEmptyShort(300)(file) && (header === null || smallObject(header, 20_000)) }),
  applyAllHeaders: Object.freeze({ args: 0 }),
  // the sources and the topics (services/sources.mjs): the shapes are the core's to judge; a name must be in streams.json
  getSources: Object.freeze({ args: 0 }),
  guessSource: Object.freeze({ args: 1, check: ([input]) => nonEmptyShort(2000)(input) }),
  trySource: Object.freeze({ args: 1, check: ([source]) => smallObject(source, 10_000) }),
  addSource: Object.freeze({ args: 1, check: ([source]) => smallObject(source, 10_000) }),
  updateSource: Object.freeze({ args: 2, check: ([name, patch]) => name100(name) && smallObject(patch, 10_000) }),
  removeSource: Object.freeze({ args: 1, check: ([name]) => name100(name) }),
  setSourcePaused: Object.freeze({ args: 2, check: ([name, paused]) => name100(name) && typeof paused === 'boolean' }),
  addManualLink: Object.freeze({ args: 2, check: ([url, title]) => httpUrl(url) && shortString(300)(title) }),
  addTopic: Object.freeze({ args: 1, check: ([topic]) => smallObject(topic, 10_000) && name100(topic.name) }),
  updateTopic: Object.freeze({ args: 2, check: ([name, patch]) => name100(name) && smallObject(patch, 10_000) }),
  removeTopic: Object.freeze({ args: 1, check: ([name]) => name100(name) }),
  // the library's 「要求」 (v2 package F, services/sources.mjs): the text the user typed; the core trims it and judges its length
  getBrief: Object.freeze({ args: 0 }),
  setBrief: Object.freeze({ args: 1, check: ([text]) => shortString(8000)(text) }),
  // the pipeline's nodes (services/pipeline.mjs): the whole configuration back; a url to try must be in the ledger
  getPipeline: Object.freeze({ args: 0 }),
  savePipeline: Object.freeze({ args: 1, check: ([cfg]) => smallObject(cfg, 200_000) }),
  // draft: the node being edited, not saved yet (null = the saved one); its id must be nodeId
  previewNode: Object.freeze({ args: 3, check: ([nodeId, url, draft]) => name100(nodeId) && url2000(url) && (draft === null || (draft !== null && typeof draft === 'object' && !Array.isArray(draft) && draft.id === nodeId)) }),
  // the run status, the graph, the verdicts (services/status.mjs)
  getStatus: Object.freeze({ args: 0 }),
  openLogsFolder: Object.freeze({ args: 0 }),
  getGraph: Object.freeze({ args: 1, check: ([filter]) => graphFilter(filter) }),
  getVerdicts: Object.freeze({ args: 1, check: ([url]) => url2000(url) }),
  // asking the library (services/ask.mjs): one question at a time
  askLibrary: Object.freeze({ args: 1, check: ([q]) => question(q) }),
  getDemands: Object.freeze({ args: 0 }),
  addDemand: Object.freeze({ args: 2, check: ([topic, q]) => name100(topic) && shortString(500)(q) }),
  answerFeedback: Object.freeze({ args: 2, check: ([q, note]) => nonEmptyShort(500)(q) && nonEmptyShort(2000)(note) }),
  // v2 package E (services/ask.mjs; docs/desktop.md §4.7): the library's chat box, one sentence (1–500 characters) routed to the
  // library's answer or the main agent; your answer to 「这是要改这个库吗？」 takes the route you chose. One sentence at a time
  sendLibraryMessage: Object.freeze({ args: 1, check: ([t]) => question(t) }),
  resolveLibraryMessage: Object.freeze({ args: 2, check: ([t, route]) => question(t) && (route === 'question' || route === 'change') }),
  // v2 package M (services/quota.mjs; docs/desktop.md §4.11): the current connection's plan windows or API balance, or null
  getQuota: Object.freeze({ args: 0 }),
})

export const ERROR_CODES = Object.freeze([
  'refused', // the call did not come from the app's own page (bridge.mjs)
  'bad_arguments', // wrong number or kind of arguments
  'no_library', // no library folder opened yet
  'open_failed', // the system could not open the folder or the address
  'no_connection', // a method that calls a model (askLibrary, previewNode, sendLibraryMessage / resolveLibraryMessage) with no connection chosen
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
  'bad-feedback', 'bad-question', 'bad-view', 'locked-node', 'bad-config', 'not-found',
  // writing a header onto a file of an imported folder (core-api 5.9)
  'not-proposable', 'bad-file-name', 'already-conforming', 'bad-id',
  // a step of 首次设置 recorded with an unknown step or `by` (core recordSetupStep)
  'bad-setup',
  // a library id the registry does not hold (core withActive / withMeta / withoutLibrary; v2 package A)
  'unknown-library',
  // a proposal card that does not fit (core draftProposal / reviseProposal), one that is not pending any more (v2 package B)
  'bad-proposal', 'not-pending',
  // a suggestion card that is not open (core dismissSuggestion / acceptSuggestion; v2 package D, wired by C)
  'not-open',
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
