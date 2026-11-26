/**
 * 1.1 W6b: building a library — and changing a library's card — as a conversation with the main agent (core createBuild;
 * the build SOP, the two web tools; acceptance A1, A2, B3).
 * 1.1.3 (维护者 11-26 「每个库对应一个 session」; 赞妮's plan 对话与右键菜单-方案.md, 维护者: 「按改后的建议」): many conversations.
 *   - Each registered library has one conversation (id `lib:<libraryId>`), from its building to every change of its card;
 *     a library never talked about has one with nothing in it. A new library's conversation, before its card is confirmed,
 *     belongs to no library (id `new:<file stem>`): there may be several; confirmed, it is the new library's (its file ends
 *     as built and is found again by the folder it made, as in 1.1.2).
 *   - A conversation has at most one thing open (一件事: a build, a change of the card, a bringing over), kept in a file of
 *     its own under <appData>\build after every turn: 1.1.2's build.json is read as it is (a change or a bringing over is
 *     that library's open thing; a new library's is a conversation not built yet), every other one is open-<token>.json.
 *     When it ends (确认, 放弃, the budget …) the file is renamed ended-<time>-<why>.json as before (built · dropped ·
 *     stopped) and is that library's history. A library's thing that ended by itself (stopped) is ended at once (a
 *     1.1.2 build.json found so at the start too); a new library's stays, 已结束, until 重新开始 or 放弃建库.
 *   - The main agent works on one conversation at a time (MAX_AT_ONCE): the words of another wait their turn (in memory
 *     only, first sent first) and start by themselves. Switching, typing, discarding are never held up by another one.
 *   - The words sent are written to the file before the agent is asked (retry + trouble 'interrupted'): an app that quits
 *     part way shows 「上一条消息未发送」 and 重试 at the next start.
 *   - 停止处理 (stopBuild): a turn is stopped (the connection's signal: the CLI's process tree ended, the API request
 *     aborted, Streams' check of the card's addresses stopped between two); the core puts the state back to before the
 *     words (core createBuild: aborted), they go back to the box (view.back), and the next words open a new session told
 *     Streams' own record. The words of a thing's first sentence stopped: the thing never opened. A conversation waiting:
 *     取消排队, the same without a signal.
 *   - 放弃 (dropBuild) takes back only that conversation's card (1.1.2 took back every card waiting); while its turn runs
 *     or waits, it is stopped first.
 *   - A change's card is not confirmed when the library's card is no longer the one the change started from (stale).
 *   - Claude Code, Codex and an API key build (an API key with Streams' own tools, and only with the model's key: none
 *     stored → 'build-needs-key'; none chosen: 'no_connection'). The agent's session has the two web tools in a working
 *     folder of its own (one for all: one turn at a time).
 *   - A new library goes to <libraryRoot>\<the card's name as a folder name> (' 2', ' 3' … when taken); once made it is
 *     registered and becomes the current library (services/library.mjs adopt).
 *
 * conv: a conversation's id — `lib:<libraryId>` or `new:<stem>`. Left out (1.1.2's calls): the conversation with something
 * open that was active last.
 *   listConversations()              → { unbuilt: [row], libraries: [row], latest, cards: [card], attention, organised }
 *                                      row: { id, kind: 'unbuilt' | 'library', title, library: { id, name } | null, hasCard,
 *                                      state, n, position, lastAt, last: { mode, why, endedAt } | null, attention } (state:
 *                                      working · waiting · unsent · ended · question · card · card-blocked · replied · idle
 *                                      · none); unbuilt newest first, libraries in the sidebar's order; latest: the id of
 *                                      the conversation active last (or null); cards: every card waiting for 确认 —
 *                                      { conv, mode, library, name, urls, sources, at, stale, busy }; attention: some
 *                                      conversation waits for you; organised: the one-time note after the upgrade is due
 *   getBuild(conv?)                  → the view (below); no conv: the one with something open active last, or null
 *   startBuild(opener, libraryId?)   → no library: a new conversation not built yet, its first turn; a library: a new thing
 *                                      in its conversation (a change of its card, or bringing it over when it has none) —
 *                                      refused while one is open there ('a build is going'). The library's thing is told,
 *                                      after its card, its step of 「每次更新的量」, its earlier things (at most 3) and its
 *                                      last update (core buildContext); a new library, 设置's step
 *   replyBuild(answer, conv?)        → the view after the next turn; answer: a string, or { picked: [option], other }
 *   retryBuild(conv?)                → the words that did not go (the connection, or the app quit), sent again
 *   restartBuild(conv)               → a conversation not built yet that ended: started again with its first words
 *   stopBuild(conv)                  → 停止处理 / 取消排队: the view, its words in back ({ gone: true, back } for a new
 *                                      conversation stopped on its first words: it is not kept)
 *   confirmBuild(conv?)              → { done: true, libraryId, update, conv } — as 1.1 (update: the first update queued for
 *                                      a library made or brought over); a stale change → bad_arguments 'card-changed'
 *   dropBuild(conv?)                 → null — 放弃建库 / 放弃修改 / 放弃转换 (that conversation's card only)
 *   getConversation(id)              → { id, mode, why, library, startedAt, endedAt, turns } of an ended thing
 *   dismissConversationsNote()       → null — 知道了 (written: <appData>\build\organised.json)
 * Each change sends `build-changed { conv, phase }` (waiting · started · progress · done · ended · stopped).
 * The view: { conv, kind, title, library: { id, name } | null, hasCard, open, mode: 'create' | 'edit' | 'convert',
 *   status: 'none' | 'talking' | 'stopped', state, n, opener, asked, busy, waiting (position) | null, live, stopped,
 *   trouble, turns, earlier, lastEnd, sending, back, note, stale, lastAt }
 *   turns: [{ role: 'you', text, answer? } | { role: 'agent', kind, say, question?, card?, before?, changes?, urls?,
 *   canConfirm?, problems?, notice?, at }]; earlier: a library's ended things, oldest first, with their turns; lastEnd:
 *   { why, notice } of a library's latest ended thing; sending: the words waiting their turn; back / note ('stopped' ·
 *   'left'): the words a stop gave back.
 * Development and tests only (not in a packaged app; main.mjs reads it): STREAMS_DEV_BUILD, a JSON file { replies, byOpener?,
 * byLibrary? } — the agent's session answers a conversation's n-th call with the n-th reply (byLibrary[libraryId] or the
 * replies of the first byOpener key its opener starts with, else replies); a reply's holdMs keeps the turn that long (a
 * stop ends it at once); STREAMS_DEV_READS, a JSON file { [url]: { ok, method?, reason?, links?, title?, text? } } —
 * Streams' readers in a build answer from it.
 * @module desktop/main/services/build
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { BridgeError } from '../bridge-methods.mjs'
import {
  cardChanges, cardHandlers, cardUrls, createActionRunner, createBuild, createSessionConnector, libraryFolderName, loadDefinition, readCard,
  buildContext, volumeBlock, readLibraryVolume, isVolume, DEFAULT_VOLUME, CONTEXT_LIMITS,
} from '../core.mjs'
import { lastUpdateOf } from './volume.mjs'

export const BUILD_KINDS = Object.freeze(['claude-code', 'codex', 'api'])
export const BUILD_CWD = join(tmpdir(), 'streams-build-cwd')
// 1.1.3 (plan 7.2): the main agent works on this many conversations at once; the others wait
export const MAX_AT_ONCE = 1
const OPENER_MAX = 2000
const TITLE_MAX = 40

// with the development connection and no script: one question with no options, and nothing more (never the real command line)
export const DEV_BUILD_REPLIES = Object.freeze([{ json: { say: '', question: { text: 'What will you use it for?', kind: 'input' } } }])

/** Streams' readers in a build from STREAMS_DEV_READS (an address not in it: a server that does not answer). */
export function devBuildReaders(file) {
  let table = {}
  if (file) try { table = JSON.parse(readFileSync(file, 'utf8')) ?? {} } catch { table = {} }
  const look = url => (table && typeof table[url] === 'object' && table[url]) || { ok: false, reason: 'failed' }
  // 1.1.1 P10, tests only: an entry's delayMs — the reader takes that long (so a step of an update can be seen)
  const slow = async r => { if (Number(r.delayMs) > 0) await new Promise(resolve => setTimeout(resolve, Number(r.delayMs))) }
  return {
    readPage: async url => { const r = look(url); await slow(r); return r.ok ? { url, ok: true, method: r.method ?? 'direct', title: typeof r.title === 'string' ? r.title : '', text: typeof r.text === 'string' ? r.text : '' } : { url, ok: false, method: null, reason: r.reason ?? 'failed' } },
    readLinks: async url => { const r = look(url); await slow(r); return r.ok ? { ok: true, url, links: Array.isArray(r.links) ? r.links : [], method: 'direct' } : { ok: false, url, links: [], reason: r.reason ?? 'failed' } },
  }
}

/**
 * A stand-in for the agent's session (STREAMS_DEV_BUILD): a conversation's n-th call gets the n-th reply of its own list
 * (who: { library, opener } — byLibrary, byOpener, else replies). file null: DEV_BUILD_REPLIES.
 */
export function devBuildSession(file, callsSoFar, who = {}) {
  return {
    // 1.1.1 P10: a reply's progress — [{ searches, reads, afterMs }] told one by one before it answers
    async send(req, { onProgress, signal } = {}) {
      let replies = []
      if (file === null) replies = DEV_BUILD_REPLIES
      else {
        try {
          const script = JSON.parse(readFileSync(file, 'utf8')) ?? {}
          const byOpener = script.byOpener && typeof script.byOpener === 'object' ? Object.entries(script.byOpener).find(([k]) => typeof who.opener === 'string' && who.opener.startsWith(k))?.[1] : null
          replies = (who.library && script.byLibrary?.[who.library]) || byOpener || script.replies || []
        } catch { replies = [] }
      }
      const r = replies[Math.min(callsSoFar(), replies.length - 1)] ?? { ok: false, code: 'failed' }
      const stopped = () => ({ ok: false, code: 'stopped', stopped: true, sessionId: 'dev-build', reads: r.reads ?? [], searches: r.searches ?? [], otherTools: [] })
      // 1.1.3, tests only: holdMs — the turn takes that long; a stop (the signal) ends it at once
      if (Number(r.holdMs) > 0) {
        const done = await new Promise(resolve => {
          const t = setTimeout(() => resolve('done'), Number(r.holdMs))
          if (signal?.aborted) { clearTimeout(t); resolve('stopped') }
          signal?.addEventListener?.('abort', () => { clearTimeout(t); resolve('stopped') }, { once: true })
        })
        if (done === 'stopped') return stopped()
      }
      if (signal?.aborted) return stopped()
      if (r.ok === false) return { ok: false, code: r.code ?? 'failed', sessionId: 'dev-build', reads: [], searches: [], otherTools: [] }
      // words that are not JSON (the core sends them back once, then stops the build)
      if (typeof r.text === 'string') return { ok: false, code: 'bad-format', text: r.text, sessionId: 'dev-build', reads: [], searches: [], otherTools: [] }
      for (const p of Array.isArray(r.progress) ? r.progress : []) { if (Number(p.afterMs) > 0) await new Promise(resolve => setTimeout(resolve, Number(p.afterMs))); onProgress?.({ searches: p.searches ?? 0, reads: p.reads ?? 0 }) }
      return { ok: true, json: r.json, text: JSON.stringify(r.json), sessionId: 'dev-build', resumed: callsSoFar() > 0, reads: r.reads ?? [], searches: r.searches ?? [], otherTools: [] }
    },
  }
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
/** JSON with its keys in order (two cards compared by what they say, not by how their keys were written). */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
const STEM = /^(build|open-[0-9A-Za-z-]{1,80})$/
const ENDED = /^ended-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-([a-z]+)\.json$/
const stampIso = st => st.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/, '$1:$2:$3.$4')
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && resolve(a).toLowerCase() === resolve(b).toLowerCase()
const modeOf = c => (c?.edit ? 'edit' : c?.convert ? 'convert' : 'create')
const libraryIdOf = core => core?.edit?.library ?? core?.convert?.library ?? null
// the states in which a conversation waits for you (the sidebar's 主 Agent and the row's dot)
export const ATTENTION = Object.freeze(['question', 'card', 'card-blocked', 'unsent'])

/**
 * @param {object} o
 * @param {string} o.appDataDir
 * @param {object} o.library - services/library.mjs (find, adopt, current, entries)
 * @param {object} o.connections - services/connections.mjs (active)
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => string} o.libraryRoot - where a new library goes
 * @param {() => {resolved: string}} [o.locale]
 * @param {() => Date} [o.now]
 * @param {(active: object, callsSoFar: () => number, who: object) => object} [o.session] - the agent's session for the active connection
 * @param {() => {readPage: Function, readLinks: Function}} [o.readers] - 1.1.1 P1: Streams' own readers for the card's addresses
 * @param {(active: object, search: Function|null) => object} [o.apiSession] - 1.1.1 P6: the API connection's session with Streams' tools
 * @param {(active: object) => Promise<{search: Function}|null>} [o.apiSearch] - 1.1.1 P6: its search (core searchFor), or null
 */
export function createBuildService({ appDataDir, library, connections, emit, log, libraryRoot, locale = () => ({ resolved: 'zh-CN' }), now = () => new Date(), session = active => createSessionConnector(active.connection, {}, { cwd: BUILD_CWD, web: true }), afterBuilt = null, readers = () => ({}), apiSession = null, apiSearch = async () => null, defaultVolume = () => DEFAULT_VOLUME }) {
  const dir = join(appDataDir, 'build')
  const pendingDir = join(dir, 'pending')
  const noteFile = join(dir, 'organised.json')
  const definition = loadDefinition()

  // ---- the conversations -------------------------------------------------------------------------------------------------
  // c: { id, libraryId, file, saved, build, busy, waiting, ctl, turnP, live, back, note, touched }
  //   saved: the open thing (core state + stopped, trouble, retry) or null; file: where it is kept
  const convs = new Map()
  const changed = (c, phase) => emit('build-changed', { conv: c.id, phase })
  const fresh = (id, libraryId, file = null) => ({ id, libraryId, file, saved: null, build: null, busy: false, waiting: false, ctl: null, turnP: null, live: null, back: null, note: null, touched: null })

  const writeOf = c => {
    if (!c.saved || !c.file) return
    mkdirSync(dir, { recursive: true })
    writeFileSync(c.file, JSON.stringify(c.saved, null, 1))
  }
  const token = () => `${now().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
  /** The file of an open thing renamed as ended (its time, its why); a name taken already gets the next millisecond. */
  const archive = (c, why) => {
    if (!c.file || !existsSync(c.file)) return
    let t = now().getTime()
    let to
    for (;;) {
      to = join(dir, `ended-${new Date(t).toISOString().replace(/[:.]/g, '-')}-${why}.json`)
      if (!existsSync(to)) break
      t += 1
    }
    try { renameSync(c.file, to) } catch (err) { log(`build: the ended conversation not kept: ${String(err?.message ?? err)}`) }
  }
  /** The open thing ends: kept as ended; a new library's conversation is no longer listed, a library's has nothing open. */
  const end = (c, why) => {
    archive(c, why)
    c.saved = null
    c.build = null
    c.file = null
    if (!c.libraryId) convs.delete(c.id)
    changed(c, 'ended')
  }
  /** A thing that never opened (its first words stopped or taken out of the queue): its file goes, nothing is kept. */
  const unopen = c => {
    if (c.file) { try { unlinkSync(c.file) } catch { /* gone already */ } }
    c.saved = null
    c.build = null
    c.file = null
    if (!c.libraryId) convs.delete(c.id)
  }

  const libConv = libraryId => {
    const id = `lib:${libraryId}`
    let c = convs.get(id)
    if (!c) { c = fresh(id, libraryId); convs.set(id, c) }
    return c
  }
  /** The conversation of an id the page sent (a library registered, or a new library's conversation kept). */
  const convOf = id => {
    if (typeof id !== 'string') throw new BridgeError('bad_arguments', 'no conversation')
    if (id.startsWith('lib:')) {
      const libraryId = id.slice(4)
      if (!library.find(libraryId)) throw new BridgeError('bad_arguments', `no library ${libraryId}`)
      return libConv(libraryId)
    }
    const c = convs.get(id)
    if (!c || c.libraryId) throw new BridgeError('bad_arguments', 'no such conversation')
    return c
  }

  // the files there at the start: 1.1.2's build.json and 1.1.3's open-*.json, read as they are
  const hadOld = (() => { try { return readdirSync(dir).some(n => n === 'build.json' || ENDED.test(n)) } catch { return false } })()
  const load = () => {
    let names = []
    try { names = readdirSync(dir) } catch { return }
    for (const n of names.sort()) {
      if (!n.endsWith('.json')) continue
      const stem = n.slice(0, -5)
      if (!STEM.test(stem)) continue
      const file = join(dir, n)
      let saved = null
      try { saved = JSON.parse(readFileSync(file, 'utf8')) } catch { saved = null }
      if (!saved?.core || !Array.isArray(saved.core.turns)) { log(`build: ${n} could not be read; kept as it is`); continue }
      const libraryId = libraryIdOf(saved.core)
      if (libraryId) {
        if (!library.find(libraryId)) { log(`build: ${n} is of a library no longer registered (${libraryId}); kept as it is`); continue }
        const c = libConv(libraryId)
        if (c.saved) { log(`build: ${n}: ${libraryId} has an open conversation already (${c.file}); this one kept as it is`); continue }
        c.file = file
        c.saved = saved
        // a library's thing that ended by itself is history at once (plan 10.1)
        if (saved.stopped) { archive(c, 'stopped'); c.saved = null; c.file = null; log(`build: ${n}: the change of ${libraryId} had ended (${saved.stopped}); kept as ended`) }
      } else {
        const c = fresh(`new:${stem}`, null, file)
        c.saved = saved
        convs.set(c.id, c)
      }
      log(`build: a conversation read back (${n}, ${saved.core.turns.length} lines)`)
    }
  }
  load()
  // a new install has nothing to organise: the one-time note is never due there
  if (!hadOld && !existsSync(noteFile)) { try { mkdirSync(dir, { recursive: true }); writeFileSync(noteFile, JSON.stringify({ seen: true, at: now().toISOString(), fresh: true })) } catch { /* the note then shows once */ } }

  // ---- the connection ---------------------------------------------------------------------------------------------------
  const dirOfLibrary = id => {
    const l = library.find(id)
    if (!l) throw new BridgeError('bad_arguments', `no library ${id}`)
    return l.path
  }
  const folderFor = name => {
    const base = join(libraryRoot(), libraryFolderName(name))
    let p = base
    for (let i = 2; existsSync(p) && readdirSync(p).length > 0; i++) p = `${base} ${i}`
    return p
  }
  const runner = () => createActionRunner({
    definition,
    handlers: cardHandlers({ libraryDirFor: card => folderFor(card.name), dirOfLibrary, language: locale().resolved, defaultVolume }),
    pendingDir,
    logFile: (action, params, result) => join(result.object.id, '_actions.jsonl'),
    now,
  })
  const hasModelKey = active => { try { return Boolean(connections.getKey?.(active.connection?.api?.keyRef)) } catch { return false } }
  const activeOrRefuse = () => {
    const active = connections.active()
    if (!active) throw new BridgeError('no_connection')
    if (!BUILD_KINDS.includes(active.kind)) throw new BridgeError('bad_arguments', 'build-not-supported')
    if (active.kind === 'api' && !hasModelKey(active)) throw new BridgeError('bad_arguments', 'build-needs-key')
    return active
  }
  const lazyApi = active => {
    let built = null
    const get = async () => (built ??= apiSession(active, (await apiSearch(active))?.search ?? null))
    return { sessionful: true, async send(req, o) { return (await get()).send(req, o) } }
  }
  const whoOf = c => ({ conv: c.id, library: c.libraryId, get opener() { return c.saved?.core?.opener ?? c.saved?.retry?.arg ?? null } })
  const connectorFor = (c, active, found) => (active.kind === 'api' && apiSession
    ? (found === undefined ? lazyApi(active) : apiSession(active, found?.search ?? null))
    : session(active, () => c.saved?.core?.calls ?? 0, whoOf(c)))
  const progressOf = c => p => {
    c.live = p?.step === 'check'
      ? { ...(c.live ?? {}), step: 'check', check: { done: p.done ?? 0, total: p.total ?? 0 } }
      : { ...(c.live ?? {}), step: 'agent', agent: { searches: p?.searches ?? 0, reads: p?.reads ?? 0 } }
    changed(c, 'progress')
  }
  /** The core's conversation for a conversation's open thing (made again after a restart). */
  const coreOf = c => {
    if (c.build) return c.build
    if (!c.saved) return null
    const active = activeOrRefuse()
    c.build = createBuild({ connector: connectorFor(c, active), definition, runner: runner(), kind: active.kind, language: c.saved.core.language, state: c.saved.core, now, progress: progressOf(c), ...readers() })
    return c.build
  }

  // ---- what ended, by library (1.1.2, read once per file) -----------------------------------------------------------------
  const endedCache = new Map()
  const ended = () => {
    let names = []
    try { names = readdirSync(dir) } catch { return [] }
    const out = []
    for (const n of names.sort()) {
      const m = ENDED.exec(n)
      if (!m) continue
      if (!endedCache.has(n)) {
        let data = null
        try { data = JSON.parse(readFileSync(join(dir, n), 'utf8')) } catch { data = null }
        endedCache.set(n, data?.core && Array.isArray(data.core.turns) ? data : null)
      }
      const data = endedCache.get(n)
      if (data) out.push({ id: n.replace(/\.json$/, ''), why: m[2], endedAt: stampIso(m[1]), saved: data })
    }
    return out
  }
  const madeCache = new Map()
  /** The pending ids of the create_library a library's _actions.jsonl records (1.1.1's files name only that). */
  const madeBy = path => {
    const f = join(path, '_actions.jsonl')
    let st = null
    try { st = statSync(f) } catch { return [] }
    const k = `${st.mtimeMs}:${st.size}`
    const hit = madeCache.get(f)
    if (hit && hit.k === k) return hit.ids
    let ids = []
    try {
      ids = readFileSync(f, 'utf8').split('\n').map(l => { try { return JSON.parse(l) } catch { return null } })
        .filter(x => x?.action === 'create_library' && typeof x.pendingId === 'string').map(x => x.pendingId)
    } catch { ids = [] }
    madeCache.set(f, { k, ids })
    return ids
  }
  const libraryOfCore = (core, made = null) => {
    const id = libraryIdOf(core)
    if (id) return library.find(id) ? id : null
    const all = library.entries?.() ?? []
    if (core?.libraryDir) return all.find(l => samePath(l.path, core.libraryDir))?.id ?? null
    if (typeof core?.pendingId === 'string') {
      const byPending = made ?? new Map(all.map(l => [l.id, madeBy(l.path)]))
      return all.find(l => byPending.get(l.id)?.includes(core.pendingId))?.id ?? null
    }
    return null
  }
  const endedWithLibrary = () => {
    const made = new Map((library.entries?.() ?? []).map(l => [l.id, madeBy(l.path)]))
    return ended().map(e => ({ ...e, libraryId: libraryOfCore(e.saved.core, made) }))
  }
  const summaryOf = e => {
    const c = e.saved.core
    return { id: e.id, mode: modeOf(c), why: e.why, startedAt: c.turns[0]?.at ?? null, endedAt: e.endedAt, asked: Array.isArray(c.asked) ? c.asked.length : 0, cards: c.turns.filter(t => t.role === 'agent' && t.kind === 'card').length }
  }
  const contextOf = (libraryId, path, all) => {
    let volume = DEFAULT_VOLUME
    try { volume = readLibraryVolume(path).volume } catch { /* unreadable: the standard step */ }
    const conversations = all.filter(e => e.libraryId === libraryId).slice(-CONTEXT_LIMITS.conversations).map(e => {
      const c = e.saved.core
      return { startedAt: c.turns[0]?.at ?? null, endedAt: e.endedAt, mode: modeOf(c), why: e.why, turns: c.turns.map(t => ({ role: t.role, text: t.text, kind: t.kind, say: t.say, question: t.question })) }
    })
    return { volume, extra: buildContext({ volume, conversations, lastUpdate: lastUpdateOf(path) }) }
  }

  // ---- the view ----------------------------------------------------------------------------------------------------------
  const turnsOf = s => {
    const turns = []
    for (const t of Array.isArray(s?.turns) ? s.turns : []) {
      if (t.role === 'user') turns.push({ role: 'you', text: t.text, at: t.at ?? null, ...(t.answer && typeof t.answer === 'object' ? { answer: { picked: Array.isArray(t.answer.picked) ? t.answer.picked.filter(x => typeof x === 'string') : [], other: typeof t.answer.other === 'string' ? t.answer.other : '' } } : {}) })
      else if (t.role === 'agent') {
        const a = { role: 'agent', kind: t.kind, say: t.say ?? '', at: t.at ?? null }
        if (t.question) a.question = t.question
        if (t.card) {
          a.card = t.card; a.before = t.before ?? null; a.canConfirm = t.canConfirm === true; a.problems = t.problems ?? []
          a.changes = a.before ? cardChanges(a.before, t.card).map(x => ({ key: x.key, before: x.before, after: x.after })) : null
          try { a.urls = cardUrls(t.card).length } catch { a.urls = 0 }
        }
        if (t.notice) a.notice = t.notice
        turns.push(a)
      }
    }
    return turns
  }
  const hasCardOf = libraryId => { const l = library.find(libraryId); if (!l) return false; try { return readCard(l.path) !== null } catch { return false } }
  /** A change whose library's card is no longer the one it started from (plan 第八节 改卡的卡过期). */
  const staleOf = c => {
    const s = c.saved?.core
    if (!s?.edit || !c.libraryId) return false
    const l = library.find(c.libraryId)
    if (!l) return false
    let card = null
    try { card = readCard(l.path) } catch { card = null }
    if (!card) return true
    let volume = DEFAULT_VOLUME
    try { volume = readLibraryVolume(l.path).volume } catch { /* the standard step */ }
    return canonical({ ...card, volume }) !== canonical(s.edit.card)
  }
  const position = c => {
    const at = queue.findIndex(q => q.c === c)
    return at < 0 ? null : at + 1
  }
  const lastAgentOf = s => [...(s?.turns ?? [])].reverse().find(t => t.role === 'agent') ?? null
  const lastTurn = s => (s?.turns ?? []).filter(t => t.role === 'user' || t.role === 'agent').at(-1) ?? null
  /** What the conversation is at (plan 3.6). */
  const stateOf = (c, lastEnded) => {
    if (c.busy) return { state: 'working' }
    if (c.waiting) return { state: 'waiting', position: position(c) }
    const s = c.saved?.core
    if (!c.saved) return { state: lastEnded ? 'idle' : 'none' }
    if (c.saved.stopped) return { state: 'ended' }
    if (c.saved.trouble) return { state: 'unsent' }
    const t = lastTurn(s)
    if (t?.role === 'agent' && t.kind === 'question') return { state: 'question', n: t.question?.n ?? s.asked?.length ?? 1 }
    if (t?.role === 'agent' && t.kind === 'card') return { state: t.canConfirm === true && s.pendingId && !staleOf(c) ? 'card' : 'card-blocked' }
    if (t?.role === 'agent') return { state: 'replied' }
    return { state: 'unsent' }
  }
  const nameOf = libraryId => library.find(libraryId)?.name ?? null
  const titleOf = c => {
    if (c.libraryId) return nameOf(c.libraryId) ?? ''
    const s = c.saved?.core
    const card = [...(s?.turns ?? [])].reverse().find(t => t.role === 'agent' && t.kind === 'card' && t.card?.name)?.card?.name
    if (card) return card
    const words = String(s?.opener ?? c.saved?.retry?.arg ?? '').trim()
    return [...words].length > TITLE_MAX ? `${[...words].slice(0, TITLE_MAX).join('')}…` : words
  }
  const lastAtOf = (c, lastEnded) => {
    const at = [c.touched, lastEnded?.endedAt ?? null, ...(c.saved?.core?.turns ?? []).map(t => t.at ?? null)].filter(x => typeof x === 'string')
    if (!at.length && c.file) { try { at.push(statSync(c.file).mtime.toISOString()) } catch { /* none */ } }
    return at.sort().at(-1) ?? null
  }

  const view = (c, all = null) => {
    const everything = c.libraryId ? (all ?? endedWithLibrary()) : []
    const mine = everything.filter(e => e.libraryId === c.libraryId)
    const latest = mine.at(-1) ?? null
    const s = c.saved?.core ?? null
    const turns = s ? turnsOf(s) : []
    // the card that can be confirmed is the last one, while it still waits and the library's card is the one it changes
    const stale = staleOf(c)
    const last = [...turns].reverse().find(t => t.role === 'agent' && t.kind === 'card')
    if (last && (!s?.pendingId || stale)) last.canConfirm = false
    const hasCard = c.libraryId ? hasCardOf(c.libraryId) : false
    const st = stateOf(c, latest)
    const retry = c.saved?.retry ?? null
    return {
      conv: c.id,
      kind: c.libraryId ? 'library' : 'unbuilt',
      title: titleOf(c),
      library: c.libraryId ? { id: c.libraryId, name: nameOf(c.libraryId) } : null,
      hasCard,
      open: Boolean(c.saved),
      mode: s ? modeOf(s) : c.libraryId ? (hasCard ? 'edit' : 'convert') : 'create',
      status: !c.saved ? 'none' : c.saved.stopped ? 'stopped' : 'talking',
      state: st.state,
      n: st.n ?? null,
      opener: s?.opener ?? null,
      asked: s?.asked?.length ?? 0,
      busy: c.busy,
      waiting: c.waiting ? position(c) : null,
      live: c.busy ? c.live : null,
      stopped: c.saved?.stopped ?? null,
      // the words written before the turn: not a trouble while they are on their way
      trouble: c.busy || c.waiting ? null : c.saved?.trouble ?? null,
      sending: c.waiting && retry ? retry.arg : null,
      turns,
      stale,
      ...(c.libraryId ? { earlier: mine.map(e => ({ ...summaryOf(e), turns: turnsOf(e.saved.core) })), lastEnd: latest ? { why: latest.why, notice: latest.saved.stopped ?? null } : null } : {}),
      back: c.back,
      note: c.note,
      lastAt: lastAtOf(c, latest),
    }
  }
  const rowOf = (c, all) => {
    const mine = c.libraryId ? all.filter(e => e.libraryId === c.libraryId) : []
    const latest = mine.at(-1) ?? null
    const st = stateOf(c, latest)
    return {
      id: c.id,
      kind: c.libraryId ? 'library' : 'unbuilt',
      title: titleOf(c),
      library: c.libraryId ? { id: c.libraryId, name: nameOf(c.libraryId) } : null,
      hasCard: c.libraryId ? hasCardOf(c.libraryId) : false,
      mode: c.saved ? modeOf(c.saved.core) : null,
      open: Boolean(c.saved),
      state: st.state,
      n: st.n ?? null,
      position: st.position ?? null,
      lastAt: lastAtOf(c, latest),
      last: latest ? { mode: modeOf(latest.saved.core), why: latest.why, endedAt: latest.endedAt } : null,
      attention: ATTENTION.includes(st.state),
      // a library's ended things, oldest first (1.1.2's list had them; the page's history reads them from getBuild)
      ...(c.libraryId ? { conversations: mine.map(summaryOf) } : {}),
    }
  }
  const cardOf = c => {
    const s = c.saved?.core
    if (!s?.pendingId) return null
    const t = lastAgentOf(s)
    if (!t || t.kind !== 'card' || !t.card) return null
    let urls = 0
    try { urls = cardUrls(t.card).length } catch { urls = 0 }
    return { conv: c.id, mode: modeOf(s), library: c.libraryId ? { id: c.libraryId, name: nameOf(c.libraryId) } : null, name: t.card.name ?? '', urls, sources: Array.isArray(t.card.sources) ? t.card.sources.length : 0, at: t.at ?? null, stale: staleOf(c), busy: c.busy || c.waiting }
  }
  /** The one with something open active last (1.1.2's calls without a conversation). */
  const defaultConv = () => {
    const open = [...convs.values()].filter(c => c.saved && (!c.libraryId || library.find(c.libraryId)))
    open.sort((a, b) => String(lastAtOf(b, null) ?? '').localeCompare(String(lastAtOf(a, null) ?? '')))
    return open[0] ?? null
  }
  const pick = conv => {
    if (conv === undefined || conv === null) {
      const c = defaultConv()
      if (!c) throw new BridgeError('bad_arguments', 'no build')
      return c
    }
    return convOf(conv)
  }

  // ---- a turn, one at a time ----------------------------------------------------------------------------------------------
  let running = 0
  const queue = []
  const nextTurn = () => {
    running -= 1
    const n = queue.shift()
    if (n) { running += 1; n.go('go') }
    for (const q of queue) changed(q.c, 'waiting')
  }

  /** One turn of a conversation's agent: the words written first, then (its turn come) asked; the events around it. */
  const turn = (c, how, arg) => {
    if (c.busy || c.waiting) throw new BridgeError('busy')
    const before = { retry: c.saved.retry ?? null, trouble: c.saved.trouble ?? null }
    c.saved.retry = { how, arg }
    c.saved.trouble = { code: 'interrupted' }
    c.back = null
    c.note = null
    c.touched = now().toISOString()
    writeOf(c)
    const p = (async () => {
      if (running >= MAX_AT_ONCE) {
        c.waiting = true
        changed(c, 'waiting')
        const go = await new Promise(resolve => queue.push({ c, go: resolve }))
        c.waiting = false
        if (go === 'cancel') return leftQueue(c, arg, before)
      } else running += 1
      c.busy = true
      c.live = null
      c.ctl = new AbortController()
      changed(c, 'started')
      let out = null
      try {
        const b = coreOf(c)
        out = how === 'start' ? await b.start(arg, { signal: c.ctl.signal }) : await b.reply(arg, { signal: c.ctl.signal })
        c.saved.core = b.state()
        if (out.kind === 'aborted') {
          c.saved.trouble = null
          c.saved.retry = null
        } else {
          c.saved.trouble = out.kind === 'failed' ? { code: out.code ?? 'failed' } : null
          c.saved.retry = out.kind === 'failed' ? { how, arg } : null
          if (out.kind === 'stopped') c.saved.stopped = out.notice
        }
        log(`build: ${c.id}: ${how}: ${out.kind}${out.notice ? ` (${out.notice})` : ''}${out.code ? ` (${out.code})` : ''} · calls ${c.saved.core.calls}`)
      } catch (err) {
        if (err instanceof BridgeError) { c.saved.retry = before.retry; c.saved.trouble = before.trouble; throw err }
        log(`build: ${c.id}: ${how} failed: ${String(err?.stack ?? err)}`)
        c.saved.trouble = { code: 'internal' }
        c.saved.retry = { how, arg }
      } finally {
        c.busy = false
        c.ctl = null
        c.touched = now().toISOString()
        if (c.saved) writeOf(c)
        nextTurn()
        changed(c, 'done')
      }
      if (out?.kind === 'aborted') return stoppedTurn(c, arg)
      // a library's thing that ended by itself is history at once; its conversation goes on with the next words
      if (out?.kind === 'stopped' && c.libraryId) end(c, 'stopped')
      return view(c)
    })()
    c.turnP = p
    return p
  }
  /** The words given back after a stop (the core put the state back): a thing whose first words they were never opened. */
  const stoppedTurn = (c, arg) => {
    c.back = arg
    c.note = 'stopped'
    if (c.saved?.core?.status === 'new') {
      const id = c.id
      unopen(c)
      changed(c, 'stopped')
      if (!c.libraryId) return { conv: id, gone: true, back: arg, note: 'stopped' }
      return view(c)
    }
    changed(c, 'stopped')
    return view(c)
  }
  const leftQueue = (c, arg, before) => {
    c.saved.retry = before.retry
    c.saved.trouble = before.trouble
    c.back = arg
    c.note = 'left'
    if (c.saved.core.status === 'new') {
      const id = c.id
      unopen(c)
      changed(c, 'stopped')
      if (!c.libraryId) return { conv: id, gone: true, back: arg, note: 'left' }
      return view(c)
    }
    writeOf(c)
    changed(c, 'stopped')
    return view(c)
  }
  /** Stop the turn that runs, or take the words out of the queue; → what the turn gave back. */
  const stop = async c => {
    if (c.waiting) {
      const at = queue.findIndex(q => q.c === c)
      if (at >= 0) { const [q] = queue.splice(at, 1); q.go('cancel'); for (const o of queue) changed(o.c, 'waiting') }
      return c.turnP
    }
    if (c.busy) { c.ctl?.abort(); return c.turnP }
    return null
  }

  /** A new thing in a conversation: its core and its file, then its first turn. */
  const begin = async (c, text, { edit = null, convert = null, extra = '' } = {}) => {
    const active = activeOrRefuse()
    const found = active.kind === 'api' && apiSession ? await apiSearch(active) : undefined
    c.file = c.file ?? join(dir, `open-${token()}.json`)
    c.build = createBuild({ connector: connectorFor(c, active, found), definition, runner: runner(), kind: active.kind, language: locale().resolved, now, edit, convert, extra, search: active.kind !== 'api' || Boolean(found), progress: progressOf(c), ...readers() })
    c.saved = { v: 1, core: c.build.state(), stopped: null, trouble: null, retry: null }
    return turn(c, 'start', text)
  }

  // ---- the bridge ----------------------------------------------------------------------------------------------------------
  const handlers = {
    listConversations() {
      const all = endedWithLibrary()
      const entries = library.entries?.() ?? []
      const libraries = entries.map(l => rowOf(libConv(l.id), all))
      const unbuilt = [...convs.values()].filter(c => !c.libraryId && c.saved).map(c => rowOf(c, all))
      unbuilt.sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
      const latest = [...unbuilt, ...libraries].filter(r => r.lastAt).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))[0]?.id ?? null
      const cards = [...convs.values()].filter(c => !c.libraryId || library.find(c.libraryId)).map(cardOf).filter(Boolean)
      cards.sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
      const organised = hadOld && !existsSync(noteFile)
      return { unbuilt, libraries, latest, cards, attention: [...unbuilt, ...libraries].some(r => r.attention), organised }
    },
    getBuild(conv) {
      if (conv === undefined || conv === null) { const c = defaultConv(); return c ? view(c) : null }
      return view(convOf(conv))
    },
    getConversation(id) {
      const e = endedWithLibrary().find(x => x.id === id)
      if (!e) throw new BridgeError('bad_arguments', 'no such conversation')
      return { ...summaryOf(e), library: e.libraryId ? { id: e.libraryId, name: nameOf(e.libraryId) } : null, turns: turnsOf(e.saved.core) }
    },
    async startBuild(opener, libraryId) {
      const text = String(opener).trim()
      if (!text || text.length > OPENER_MAX) throw new BridgeError('bad_arguments', 'what to follow')
      activeOrRefuse()
      if (libraryId !== undefined && libraryId !== null) {
        const path = dirOfLibrary(libraryId)
        const c = libConv(libraryId)
        if (c.saved) throw new BridgeError('bad_arguments', 'a build is going')
        const card = readCard(path)
        const ctx = contextOf(libraryId, path, endedWithLibrary())
        // the step goes with the card the agent sees: a card that proposes another shows it among the changes (A2)
        return begin(c, text, card ? { edit: { library: libraryId, card: { ...card, volume: ctx.volume } }, extra: ctx.extra } : { convert: { library: libraryId }, extra: ctx.extra })
      }
      let v = DEFAULT_VOLUME
      try { v = defaultVolume() } catch { v = DEFAULT_VOLUME }
      const t = token()
      const c = fresh(`new:open-${t}`, null, join(dir, `open-${t}.json`))
      convs.set(c.id, c)
      return begin(c, text, { extra: volumeBlock(isVolume(v) ? v : DEFAULT_VOLUME, { fresh: true }) })
    },
    async replyBuild(answer, conv) {
      const c = pick(conv)
      if (!c.saved) throw new BridgeError('bad_arguments', 'no build')
      if (c.saved.stopped) throw new BridgeError('bad_arguments', 'this build stopped')
      if (c.saved.core.status === 'new') throw new BridgeError('bad_arguments', 'use retryBuild')
      return turn(c, 'reply', answer)
    },
    async retryBuild(conv) {
      const c = pick(conv)
      if (!c.saved?.retry) throw new BridgeError('bad_arguments', 'nothing to try again')
      const { how, arg } = c.saved.retry
      return turn(c, how, arg)
    },
    async restartBuild(conv) {
      const c = convOf(conv)
      if (c.libraryId || !c.saved?.stopped) throw new BridgeError('bad_arguments', 'nothing to start again')
      if (c.busy || c.waiting) throw new BridgeError('busy')
      const opener = c.saved.core.opener
      // the ended thing is kept as such; the same conversation goes on in the same file
      archive(c, 'stopped')
      c.build = null
      c.saved = null
      let v = DEFAULT_VOLUME
      try { v = defaultVolume() } catch { v = DEFAULT_VOLUME }
      return begin(c, opener, { extra: volumeBlock(isVolume(v) ? v : DEFAULT_VOLUME, { fresh: true }) })
    },
    async stopBuild(conv) {
      const c = convOf(conv)
      if (!c.busy && !c.waiting) throw new BridgeError('bad_arguments', 'nothing to stop')
      return stop(c)
    },
    async confirmBuild(conv) {
      const c = pick(conv)
      if (!c.saved) throw new BridgeError('bad_arguments', 'no build')
      if (c.busy || c.waiting) throw new BridgeError('busy')
      if (staleOf(c)) { log(`build: ${c.id}: confirm refused, the library's card changed after this change started`); throw new BridgeError('bad_arguments', 'card-changed') }
      const b = coreOf(c)
      const out = await b.confirm().catch(err => { log(`build: confirm: ${String(err?.message ?? err)}`); throw new BridgeError('bad_arguments', 'nothing to confirm') })
      if (out.status !== 'done') {
        c.saved.core = b.state()
        writeOf(c)
        log(`build: confirm: ${out.status}`)
        throw new BridgeError('bad_arguments', `not done: ${out.status}`)
      }
      const path = b.state().libraryDir
      const edit = c.saved.core.edit ?? c.saved.core.convert ?? null
      let libraryId
      if (edit) {
        libraryId = edit.library
        emit('library-changed', library.current())
      } else {
        const lib = library.adopt(path, { name: b.state().card?.name })
        libraryId = lib?.libraryId ?? null
      }
      const mode = c.saved.core.convert ? 'convert' : edit ? 'edit' : 'create'
      log(`build: ${c.id}: ${mode === 'convert' ? 'library brought over' : mode === 'edit' ? 'card changed' : 'library made'}: ${path}`)
      c.saved.core = b.state()
      writeOf(c)
      end(c, 'built')
      let update = null
      if (mode !== 'edit' && afterBuilt && libraryId) {
        try { update = afterBuilt({ libraryId, path, mode }) ?? null } catch (err) { log(`build: the first update not queued: ${String(err?.message ?? err)}`) }
        log(`build: first update of ${libraryId}: ${JSON.stringify(update)}`)
      }
      if (libraryId) changed({ id: `lib:${libraryId}` }, 'ended')
      return { done: true, libraryId, update, conv: libraryId ? `lib:${libraryId}` : null }
    },
    async dropBuild(conv) {
      let c
      try { c = pick(conv) } catch (err) { if (conv === undefined || conv === null) return null; throw err }
      // a turn that runs or waits is stopped first (plan 6.2)
      if (c.busy || c.waiting) await stop(c)
      if (!c.saved) return null
      try { coreOf(c)?.drop() } catch {
        // the connection may be gone: only this conversation's card is taken back
        const id = c.saved?.core?.pendingId
        if (id) { try { runner().reject(id) } catch (err) { log(`build: pending not taken back: ${String(err?.message ?? err)}`) } }
      }
      if (c.saved?.core && c.saved.core.status !== 'built') c.saved.core.status = 'dropped'
      writeOf(c)
      end(c, 'dropped')
      return null
    },
    dismissConversationsNote() {
      mkdirSync(dir, { recursive: true })
      writeFileSync(noteFile, JSON.stringify({ seen: true, at: now().toISOString() }))
      return null
    },
  }
  return { handlers }
}
