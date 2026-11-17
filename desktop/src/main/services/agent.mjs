/**
 * The main agent in the main process (v2 package C; docs/desktop.md §4.6, docs/core-api.md 5.15; docs/design/v2/architecture.md
 * 一、2.2): the conversation (core agentTurn: the transcript, the session cache, the situation, the JSON answer and its lookups,
 * the proposal cards through package B's createProposal), one turn at a time — a sentence sent while a turn runs waits for it
 * (a queue, in order) — and the rule-based suggestion cards of package D wired in: checked after every round of the pipeline,
 * listed, 「不要」, 「要」.
 *
 * Where it keeps things: <appData>/agent/ (core agent/store.mjs): transcript.jsonl, session.json, notes.jsonl, usage.jsonl.
 * Claude Code and Codex run for the agent in `cwd`, an empty folder of its own under the system's temporary folder (default
 * core AGENT_CWD = %TEMP%/streams-agent-cwd; core connect/session.mjs: zero tools / the read-only sandbox, as v1.0) — outside
 * the app data, so layout.mjs's rule that no model subprocess runs inside the protected folder still holds (the PM, 11-09;
 * contract C3 had said agent/cwd). The agent cannot change anything itself: what it proposes is a pending card (services/proposals.mjs
 * createProposal, by: 'agent'); only the user's 「确认」 (confirmProposal) makes it happen.
 *
 * Redesign R5a (docs/desktop.md §4.19; docs/core-api.md 5.14.6–5.14.8): one kind of 提议 for the page, from two places —
 * 主 Agent 提议 (the proposals service) and 系统检测 (each library's suggestions.jsonl) — kept where they are and seen together:
 *   listToConfirm()           every library's: { items, handled, count } — each item with `from` ('agent' | 'system'),
 *                                    the library's id and name, its kind, its actions (the 动作表, the main one first: id, the key
 *                                    of its words in texts/proposals.js, whether it calls the main agent) and its evidence in the
 *                                    interface's terms (no raw error, no HTTP code); `handled` = what became of the latest ones
 *   actOnSuggestion(libraryId, key, action)  a 系统检测's action, on ANY registered library (not only the current one), done by
 *                                    the core (runSuggestionAction): pause-source / set-strictness change that library's streams.json
 *                                    and are recorded as 手动修改 (changes.jsonl by 'you'), no model call; edit-address answers
 *                                    where the page goes (the change is updateSource's); dismiss records 已忽略; forward /
 *                                    draft-proposal hand the card to the agent for one turn in the interface's words (core
 *                                    handoffText: no kind name, no JSON, no raw error) and record 已转交主 Agent once that turn
 *                                    answered — a turn whose connection failed leaves the card 待确认 and answers { done: false,
 *                                    status: 'open', failure: { category: 'connection', code } } (precheck fix 6). A card that no
 *                                    longer fits (core staleReason) is expired instead and not acted on (bad_arguments).
 *   Every new, dismissed, forwarded, acted or expired 系统检测 sends `suggestions-changed { libraryId, key, status }`, so the
 *   page does not depend on the order things run in (O5). The check runs after every round (afterRound), right after a
 *   放弃 is written (afterDismiss: rule ⑤), and whenever a library's configuration changed (checkLibrary: main.mjs on
 *   library-changed, and after a confirmed proposal — a confirmed 暂停该来源 expires the same source's ① ③).
 * 「要」 (acceptSuggestion, the page of before R5a) is 「交由主 Agent 分析」 now.
 *
 * 1.0.1 (F3 · F5): every turn hands the core the interface's language (locale) and the connection the settings choose — its
 * kind, the API vendor, 主模型 and 核验模型 as the pipeline resolves them, nothing else — for the situation (core situation.mjs).
 *
 * Events: `agent-changed { phase: 'started' | 'done', turn, libraryId }` at the start and the end of every turn;
 * `suggestions-changed` (above).
 *
 * Development and tests only (a packaged app ignores them; main.mjs reads the variables):
 *   STREAMS_DEV_CONNECTION=fake           the agent talks to the core's scripted stand-in (scriptedAgentConnector), whatever
 *                                         connection is chosen; login-expired / bad-format-once: the stand-in fails the
 *                                         same way (every call / the first call)
 *   STREAMS_DEV_AGENT_SCRIPT=<json file>  its answers, in order: [answer, …] or { answers: [...] } (each an object = the
 *                                         model's JSON; { $text } raw text; { $fail: code }; { $lost: true }); read once
 * Pure Node apart from what is injected, so the rules run in plain Node (test/services-agent.test.mjs, test/services-r5a.test.mjs).
 * @module desktop/main/services/agent
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { BridgeError, bridgeErrorOf } from '../bridge-methods.mjs'
import { isInside } from '../layout.mjs'
import { publicCard } from '../public-data.mjs'
import {
  AGENT_CWD, AGENT_DIR, actionsFor, agentTurn, checkSuggestions, dismissSuggestion, handledSuggestions, handoffText, lastSummary, nextTurn, openSuggestions, overlapSuggestions,
  pipelineFrom, publicRow, readBrief, readConfig, readSessions, readTranscript, recordSuggestions, runSuggestionAction, scriptedAgentConnector, suggestFor, suggestionFacts,
  suggestionText, thresholdsOf,
} from '../core.mjs'

export const TRANSCRIPT_PAGE = 100
export const HANDLED_SHOWN = 50

/** Redesign R5a: a 系统检测 action → the key of its words (texts/proposals.js PROPOSALS.actions) and whether it calls the agent. */
export const ACTION_WORDS = Object.freeze({
  'pause-source': 'pauseSource', 'edit-address': 'editAddress', 'set-strictness': 'setStrictness', forward: 'forward', 'draft-proposal': 'draftProposal', dismiss: 'dismiss',
  confirm: 'confirm', create: 'create', revise: 'revise', decline: 'decline',
})
const CALLS_MODEL = ['forward', 'draft-proposal']

/**
 * @param {object} o
 * @param {string} o.appDataDir - layout.appData: the agent's folder goes there
 * @param {object} o.library - services/library.mjs (entries, find, entryOf, usable, current)
 * @param {object} o.connections - services/connections.mjs (active, sessionConnector, devConnection)
 * @param {{createProposal: Function, handlers: {listProposals: Function}}} o.proposals - services/proposals.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 * @param {() => {resolved: string}} [o.locale] - the language of the words a 系统检测 is handed over in
 * @param {string|null} [o.devScript] - STREAMS_DEV_AGENT_SCRIPT
 * @param {string} [o.cwd] - the CLI connections' working folder: absolute, never inside appDataDir (default core AGENT_CWD)
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs — the fetchers' messages of the 系统检测
 * @throws {TypeError} a cwd that is not absolute or that is inside the app data
 */
export function createAgentService({ appDataDir, library, connections, proposals, emit, log, now = () => new Date(), locale = () => ({ resolved: 'zh-CN' }), devScript = null, cwd = AGENT_CWD, rawErrors = null }) {
  const agentDir = join(appDataDir, AGENT_DIR)
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new TypeError('the agent working folder must be an absolute path')
  if (isInside(cwd, appDataDir)) throw new TypeError(`the agent working folder ${cwd} must not be inside the app data ${appDataDir} (layout.mjs)`)

  // the development stand-in: made once, so its script goes on from turn to turn
  let fake = null
  const devAnswers = () => {
    if (!devScript) return []
    try {
      const data = JSON.parse(readFileSync(devScript, 'utf8'))
      const list = Array.isArray(data) ? data : Array.isArray(data?.answers) ? data.answers : []
      log(`agent: ${list.length} scripted answers from ${devScript}`)
      return list
    } catch (err) {
      log(`agent: ${devScript} unreadable: ${String(err?.message ?? err)}`)
      return []
    }
  }
  /** The connection the agent talks to now, or null (none chosen). */
  const connector = () => {
    const dev = connections.devConnection
    if (dev) {
      if (!fake) {
        fake = dev === 'fake'
          ? scriptedAgentConnector({ answers: devAnswers() })
          : dev === 'login-expired'
            ? scriptedAgentConnector({ answers: () => ({ $fail: 'login-expired' }) })
            : scriptedAgentConnector({ answers: (_req, n) => (n === 0 ? { $text: 'Sure! Here is my answer: not json at all' } : { reply: 'OK' }) })
      }
      return fake
    }
    const a = connections.active()
    return a ? connections.sessionConnector(a.kind, { cwd, log }) : null
  }
  const kindNow = () => (connections.devConnection ? 'fake' : connections.active()?.kind ?? null)
  // 1.0.1 F3: the interface's language, said in the situation (the agent writes a proposal's "why" in it)
  const language = () => (locale().resolved === 'en' ? 'en' : 'zh-CN')
  /**
   * 1.0.1 F5: the connection the settings choose, for the situation — its kind, the API vendor and the two model slots as the
   * pipeline resolves them (connections.active()), and nothing else: no key, no key reference, no address, no folder. None
   * chosen (or none readable) → null, which the situation says as 「还没有连接」.
   */
  const connectionNow = () => {
    try {
      const a = connections.active?.()
      if (!a?.kind) return null
      return { kind: a.kind, vendor: a.connection?.api?.vendor ?? null, model: a.model ?? null, verifyModel: a.verifyModel ?? null }
    } catch { return null }
  }

  // one turn at a time: each one waits for the one before it
  let chain = Promise.resolve()
  let busy = false
  let waiting = 0
  const enqueue = job => {
    waiting++
    const run = chain.then(async () => {
      waiting--
      busy = true
      try { return await job() } finally { busy = false }
    })
    chain = run.then(() => {}, () => {})
    return run
  }

  const registry = () => ({ libraries: library.entries().map(l => ({ id: l.id, path: l.path, name: l.name, addedAt: l.addedAt ?? null })) })
  // the cards oldest first (listProposals gives them newest first)
  const cards = () => proposals.handlers.listProposals(null).slice().reverse()

  /** One turn: `as` 'you' (the page's sentence) or 'note' (a 系统检测 handed over). */
  function turn(text, { libraryId = null, as = 'you' } = {}) {
    if (libraryId !== null && !library.find(libraryId)) throw new BridgeError('bad_arguments', `no library ${String(libraryId)}`)
    if (!connector()) throw new BridgeError('no_connection')
    return enqueue(async () => {
      const c = connector()
      if (!c) throw new BridgeError('no_connection')
      const n = nextTurn(readTranscript(agentDir).rows)
      emit('agent-changed', { phase: 'started', turn: n, libraryId })
      let r
      try {
        r = await agentTurn({ text, libraryId, as }, { agentDir, connector: c, registry, proposals: cards, createProposal: proposals.createProposal, now, log, rawError: (where, raw) => rawErrors?.note(`agent ${where}`, raw), language: language(), connection: connectionNow })
      } catch (err) {
        log(`agent: turn ${n} failed: ${String(err?.stack ?? err)}`)
        emit('agent-changed', { phase: 'done', turn: n, libraryId })
        throw bridgeErrorOf(err)
      }
      log(`agent: turn ${r.turn} (${c.kind}): ${r.calls} calls, ${r.lookupRounds} lookup rounds, ${r.proposalIds.length} cards${r.notice ? `, ${r.notice.map(x => x.code).join(' ')}` : ''}`)
      emit('agent-changed', { phase: 'done', turn: r.turn, libraryId })
      return { turn: r.turn, reply: r.reply, ask: r.ask, proposalIds: r.proposalIds, ...(r.notice ? { notice: r.notice } : {}) }
    })
  }

  // ---- 系统检测 (redesign R5a) -----------------------------------------------------------------------------------------

  const lang = () => (locale().resolved === 'en' ? 'en' : 'zh')
  const nameOf = id => library.find(id)?.name ?? null
  /**
   * The other REGISTERED libraries of `libraryId` (rule ④, and whether its other library is still there). Precheck fix 8: readable
   * or not — one that cannot be read now (a drive taken out) is still registered, so its overlap cards stay (the core's rule
   * skips a library it cannot read; staleReason expires a card only for one gone from the list, 'library-removed').
   */
  const othersOf = (libraryId, dir = null) => library.entries().filter(l => l.id !== libraryId && l.path !== dir).map(l => ({ libraryId: l.id, dir: l.path, name: l.name }))
  const thresholdsIn = dir => { try { const r = readConfig(dir); return r.ok ? thresholdsOf(pipelineFrom(r.config)) : null } catch { return null } }
  const changed = (libraryId, key, status) => emit('suggestions-changed', { libraryId, key, status })
  const expiredSaid = (libraryId, lines) => {
    for (const l of lines ?? []) {
      log(`agent: suggestion ${l.key} of ${libraryId} expired (${l.reason})`)
      changed(libraryId, l.key, 'expired')
    }
  }

  /** The open cards of one library that no longer fit get their `expired` line (and the page is told). */
  function checkLibrary(libraryId) {
    const e = libraryId ? library.find(libraryId) : null
    if (!e || !library.usable(e.path)) return []
    let lines = []
    try { lines = checkSuggestions(e.path, { libraries: othersOf(e.id, e.path), now }) } catch (err) { log(`agent: the suggestions of ${libraryId} not checked: ${String(err?.message ?? err)}`) }
    expiredSaid(e.id, lines)
    return lines
  }

  /** The rules on one library now: the cards that fire and are not open yet recorded; those that no longer fit expired. */
  function recordFor({ dir, libraryId = null }, why) {
    let expired = []
    try { expired = checkSuggestions(dir, { libraries: othersOf(libraryId, dir), now }) } catch (err) { log(`agent: ${why}: the suggestions not checked: ${String(err?.message ?? err)}`) }
    expiredSaid(libraryId, expired)
    const { written } = recordSuggestions(dir, suggestFor(dir, { now, otherLibraries: othersOf(libraryId, dir) }), { now })
    log(`agent: ${why} of ${libraryId ?? dir}: ${written.length} new suggestion card${written.length === 1 ? '' : 's'}${written.length ? ` (${written.map(w => w.key).join(', ')})` : ''}`)
    for (const w of written) {
      // O9: the fetcher's own message stays out of the page — into the log and the diagnostics only
      const last = w.evidence?.last
      if (last && (last.message || last.http)) rawErrors?.note(`finding ${libraryId ?? dir} ${w.key}`, { message: last.message, http: last.http, code: last.status })
      changed(libraryId, w.key, 'open')
    }
    recordOtherSide({ dir, libraryId }, why)
    return written
  }

  /**
   * Precheck fix 3 (redesign R5a; the 动作表 of ④: 「两个库各一张」): the check of ONE library records rule ④ in each other
   * readable library too — its card naming this one and the ratio (core overlapSuggestions: that library's own handlings count),
   * so the other library has its card now, not only after a run of its own (its schedule may be off).
   */
  function recordOtherSide({ dir, libraryId = null }, why) {
    const id = libraryId ?? library.entries().find(l => l.path === dir)?.id ?? null
    if (!id) return []
    const out = []
    for (const o of othersOf(id, dir)) {
      if (!library.usable(o.dir)) continue
      try {
        const { written } = recordSuggestions(o.dir, overlapSuggestions(o.dir, { now, otherLibraries: [{ libraryId: id, dir }] }), { now })
        for (const w of written) { changed(o.libraryId, w.key, 'open'); out.push(w) }
        if (written.length) log(`agent: ${why} of ${id}: rule ④ also recorded in ${o.libraryId} (${written.map(w => w.key).join(', ')})`)
      } catch (err) { log(`agent: ${why} of ${id}: rule ④ of ${o.libraryId} not recorded: ${String(err?.message ?? err)}`) }
    }
    return out
  }

  /** A 系统检测 as the page sees it: its actions (the 动作表) and its evidence in the interface's terms. */
  function systemItem(entry, s) {
    const other = s.libraryId ?? (s.kind === 'topic-overlap' ? s.subject : null)
    const actions = actionsFor(s, { thresholds: thresholdsIn(entry.path) }).map((a, i) => ({
      id: a.id, label: `actions.${ACTION_WORDS[a.id]}`, ...(a.level ? { values: { level: a.level }, level: a.level } : {}), primary: i === 0, callsModel: CALLS_MODEL.includes(a.id),
    }))
    const evidence = suggestionFacts(s)
    // the keys of its words in texts/proposals.js PROPOSALS (地址无效 has its own), and one sentence in the interface's words in
    // the language of the app now (core suggestionText: no kind name, no raw error) — R5b draws the card with either
    const textKey = s.kind === 'source-failing' && evidence.state === 'gap' ? 'source-failing-gap' : s.kind
    const otherName = other ? nameOf(other) : null
    return {
      id: `system:${entry.id}:${s.key}`, from: 'system', libraryId: entry.id, libraryName: entry.name, key: s.key, kind: s.kind, subject: s.subject,
      ...(other ? { otherLibraryId: other, otherLibraryName: otherName } : {}),
      status: 'open', createdAt: s.createdAt, evidence, actions,
      words: { title: `kinds.${textKey}`, evidence: `evidence.${textKey}` },
      summary: suggestionText(s, { otherName: otherName ?? undefined, lang: lang(), thresholds: thresholdsIn(entry.path) }),
    }
  }

  /** A 主 Agent 提议 as the page sees it (the card itself, its trials and failure without raw texts, and its three answers). */
  function agentItem(card) {
    const confirm = card.kind === 'create_library' ? 'create' : 'confirm'
    return {
      id: `agent:${card.id}`, from: 'agent', proposalId: card.id, libraryId: card.libraryId ?? null, libraryName: card.libraryId ? nameOf(card.libraryId) : (card.params?.name ?? null),
      kind: card.kind, status: card.status, createdAt: card.createdAt, card: publicCard(card, { raw: rawErrors }),
      actions: [
        { id: 'confirm', label: `actions.${confirm}`, primary: true, callsModel: false },
        { id: 'revise', label: 'actions.revise', primary: false, callsModel: false },
        { id: 'decline', label: 'actions.decline', primary: false, callsModel: false },
      ],
    }
  }

  /** The open 系统检测 of one library (by id) or of every readable one, oldest first within a library; stale ones expired first. */
  function openOf(libraryId) {
    const libs = libraryId ? [library.entryOf(libraryId)] : library.entries()
    const out = []
    for (const l of libs) {
      if (!library.usable(l.path)) continue
      checkLibrary(l.id)
      let open = []
      try { open = openSuggestions(l.path) } catch (err) { log(`agent: suggestions of ${l.id} unreadable: ${String(err?.message ?? err)}`) }
      for (const s of open) out.push({ entry: l, s })
    }
    return out
  }

  /** The page of before R5a: the open cards, their evidence without the fetcher's message or HTTP code. */
  const suggestionsOf = libraryId => openOf(libraryId).map(({ entry, s }) => ({
    libraryId: entry.id, key: s.key, kind: s.kind, subject: s.subject, ...(s.libraryId ? { otherLibraryId: s.libraryId } : {}), evidence: suggestionFacts(s), createdAt: s.createdAt,
  }))

  /** What became of the latest ones: the proposals decided, the 系统检测 handled — newest first, at most HANDLED_SHOWN. */
  function handledItems() {
    const out = []
    for (const c of proposals.handlers.listProposals(null)) {
      if (c.status === 'pending') continue
      out.push({ id: `agent:${c.id}`, from: 'agent', proposalId: c.id, libraryId: c.libraryId ?? null, libraryName: c.libraryId ? nameOf(c.libraryId) : (c.params?.name ?? null), kind: c.kind, status: c.status, at: c.decidedAt ?? c.createdAt ?? null, ...(c.reason ? { reason: c.reason } : {}), ...(c.failure ? { failure: publicCard(c, { raw: rawErrors }).failure } : {}) })
    }
    for (const l of library.entries()) {
      if (!library.usable(l.path)) continue
      let list = []
      try { list = handledSuggestions(l.path) } catch { list = [] }
      for (const h of list) {
        out.push({
          id: `system:${l.id}:${h.key}`, from: 'system', libraryId: l.id, libraryName: l.name, key: h.key, kind: h.suggestion?.kind ?? null, status: h.status, at: h.handled?.at ?? null,
          ...(h.handled?.action ? { action: h.handled.action } : {}), ...(h.handled?.level ? { level: h.handled.level } : {}), ...(h.status === 'expired' ? { reason: h.handled?.reason ?? null } : {}),
        })
      }
    }
    out.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
    return out.slice(0, HANDLED_SHOWN)
  }

  /**
   * forward / draft-proposal: the card as interface words for one turn of the agent, then — only once that turn has an answer —
   * recorded as 已转交主 Agent (precheck fix 6: it was recorded first, so a turn whose connection failed left the card handled
   * with nothing analysed and no way to try again). A card that no longer fits is expired first and not handed over.
   * → { done: true, line, turn } · { done: false, turn, failure: { category: 'connection', code } } (the card stays 待确认; `code`
   * is the connection's, the page words it: CONNECTIONS.codes) · { done: false, expired: true } (it no longer fit after the turn)
   */
  async function handOver(entry, s, action) {
    if (!connector()) throw new BridgeError('no_connection')
    const libraries = othersOf(entry.id, entry.path)
    let expired = []
    try { expired = checkSuggestions(entry.path, { libraries, now }) } catch (err) { throw bridgeErrorOf(err) }
    expiredSaid(entry.id, expired)
    const gone = expired.find(l => l.key === s.key)
    if (gone) throw new BridgeError('bad_arguments', `suggestion ${s.key} no longer fits (${gone.reason})`)
    let brief = null
    try { brief = readBrief(entry.path) } catch { brief = null }
    const other = s.libraryId ?? (s.kind === 'topic-overlap' ? s.subject : null)
    const text = handoffText(s, { libraryName: entry.name, otherName: other ? nameOf(other) : undefined, action, brief, lang: lang(), thresholds: thresholdsIn(entry.path) })
    const t = await turn(text, { libraryId: entry.id, as: 'note' })
    if (t.reply === null) {
      const code = t.notice?.find(n => n.code === 'connection')?.connection ?? 'unknown'
      log(`agent: suggestion ${s.key} of ${entry.id}: ${action}: the agent's turn had no answer (connection ${code}); the card stays open`)
      return { done: false, turn: t, failure: { category: 'connection', code } }
    }
    let r
    try { r = runSuggestionAction(entry.path, s.key, action, { libraries: othersOf(entry.id, entry.path), now }) } catch (err) { throw bridgeErrorOf(err) }
    if (!r.done) { expiredSaid(entry.id, r.expired); return { done: false, turn: t, expired: true } }
    log(`agent: suggestion ${s.key} of ${entry.id}: ${action}; handed to the agent, answered`)
    changed(entry.id, s.key, 'accepted')
    return { done: true, line: r.line, turn: t }
  }

  const handlers = {
    /** One sentence of the user → one turn of the agent (waits for a turn that runs). */
    agentSend(text, options) {
      const libraryId = options?.libraryId ?? null
      return turn(String(text).trim(), { libraryId })
    },
    /** The conversation's record: the newest `limit` rows (before turn `before`), oldest first. */
    getAgentTranscript(query) {
      const limit = query?.limit ?? TRANSCRIPT_PAGE
      const before = query?.before ?? null
      const { rows, skipped } = readTranscript(agentDir)
      const upTo = before === null ? rows : rows.filter(r => r.turn < before)
      // redesign R5a (precheck fix 2): the rows in the interface's words, their data without kind names or raw texts (core publicRow)
      const entries = upTo.slice(-limit).map(publicRow)
      return { entries, hasMore: upTo.length > entries.length, total: rows.length, skipped }
    },
    /** The connection, whether its session goes on, the number of rows, the last summary, whether a turn runs. */
    getAgentStatus() {
      const kind = kindNow()
      const s = kind ? readSessions(agentDir)[kind] ?? null : null
      const { rows } = readTranscript(agentDir)
      const summary = lastSummary(rows)
      return {
        connection: kind, sessionful: kind === null ? null : kind !== 'api',
        session: s && s.sessionId ? { live: true, startedAt: s.startedAt, turns: s.turns } : { live: false, startedAt: null, turns: 0 },
        entries: rows.length, turns: nextTurn(rows) - 1, lastSummaryAt: summary?.at ?? null, summarizedThrough: summary?.data?.through ?? 0,
        busy, waiting,
      }
    },
    listSuggestions(filter) {
      return suggestionsOf(filter?.libraryId ?? null)
    },
    /** 「忽略」 (was 「不要」): one line in the library's suggestions.jsonl; nothing else. */
    dismissSuggestion(libraryId, key, reason) {
      const e = library.entryOf(libraryId)
      try {
        const line = dismissSuggestion(e.path, key, { ...(typeof reason === 'string' && reason.trim() !== '' ? { reason: reason.trim() } : {}), now })
        log(`agent: suggestion ${key} of ${libraryId} dismissed`)
        changed(e.id, key, 'dismissed')
        return line
      } catch (err) { throw bridgeErrorOf(err) }
    },
    /** 「要」 of the page of before R5a = 「交由主 Agent 分析」: recorded, then handed to the agent for one turn. */
    async acceptSuggestion(libraryId, key) {
      const e = library.entryOf(libraryId)
      const s = openOf(libraryId).find(x => x.s.key === key)?.s
      if (!s) throw new BridgeError('bad_arguments', `no open suggestion ${key} in ${libraryId}`)
      const r = await handOver(e, s, s.kind === 'dismiss-reason' ? 'draft-proposal' : 'forward')
      // precheck fix 6: recorded only once the turn answered (accepted null: the card is still open; failure says why)
      return { accepted: r.done ? r.line : null, turn: r.turn, ...(r.failure ? { failure: r.failure } : {}) }
    },
    /** Redesign R5a: every library's 提议 waiting for the user, both places, and what became of the latest ones. */
    listToConfirm() {
      const items = [
        ...proposals.handlers.listProposals({ status: 'pending' }).slice().reverse().map(agentItem),
        ...openOf(null).map(({ entry, s }) => systemItem(entry, s)),
      ]
      return { items, handled: handledItems(), count: items.length }
    },
    /** Redesign R5a: a 系统检测's action on any registered library (the core does it; see the module's head). */
    async actOnSuggestion(libraryId, key, action) {
      const e = library.entryOf(libraryId)
      if (!library.usable(e.path)) throw new BridgeError('open_failed', `${e.path} is not a readable library`)
      const s = openSuggestions(e.path).find(x => x.key === key)
      if (!s) throw new BridgeError('bad_arguments', `no open suggestion ${key} in ${libraryId}`)
      if (action === 'forward' || action === 'draft-proposal') {
        if (!actionsFor(s, { thresholds: thresholdsIn(e.path) }).some(a => a.id === action)) throw new BridgeError('bad_arguments', `${action} is not an action of ${s.kind}`)
        const r = await handOver(e, s, action)
        // precheck fix 6: 已转交 only once the turn answered; a connection that failed leaves the card 待确认 (status open) and
        // says the kind of failure (the connection's code, the page words it) so the user can try again
        if (r.failure) return { done: false, status: 'open', action, failure: r.failure, turn: r.turn }
        if (r.expired) return { done: false, status: 'expired', action, turn: r.turn }
        return { done: true, status: 'accepted', action, line: r.line, turn: r.turn }
      }
      let r
      try { r = runSuggestionAction(e.path, key, action, { libraries: othersOf(e.id, e.path), now }) } catch (err) { throw bridgeErrorOf(err) }
      if (r.stale) { expiredSaid(e.id, r.expired); throw new BridgeError('bad_arguments', `suggestion ${key} no longer fits (${r.stale})`) }
      if (r.navigate) {
        log(`agent: suggestion ${key} of ${libraryId}: edit-address → the page opens ${r.navigate.source}`)
        return { done: false, navigate: { ...r.navigate, libraryId: e.id } }
      }
      log(`agent: suggestion ${key} of ${libraryId}: ${action}${r.changed?.length ? ` (changed ${r.changed.join(', ')}, by you)` : ''}`)
      const status = action === 'dismiss' ? 'dismissed' : 'acted'
      changed(e.id, key, status)
      expiredSaid(e.id, r.expired)
      if (r.changed?.length && library.current()?.libraryId === e.id) emit('library-changed', library.current())
      return { done: true, status, action, ...(r.line?.level ? { level: r.line.level } : {}), changed: r.changed ?? [] }
    },
  }

  /** After a round of the pipeline (services/pipeline.mjs afterRound): the library's rule-based suggestion cards recorded. */
  function afterRound({ dir, libraryId = null }) {
    return recordFor({ dir, libraryId }, 'after the round')
  }

  /** Redesign R5a (N04, rule ⑤): right after a 放弃 is written (services/pipeline.mjs settlePending) — not at the end of a run. */
  function afterDismiss({ dir, libraryId = null }) {
    return recordFor({ dir, libraryId }, 'after a dismissal')
  }

  /** Redesign R5a: a confirmed proposal changed a library (a confirmed 暂停该来源 expires that source's ① ③). */
  function afterProposal(card) {
    if (card?.status === 'confirmed' && card.libraryId) return checkLibrary(card.libraryId)
    return []
  }

  return { handlers, afterRound, afterDismiss, afterProposal, checkLibrary, agentDir, cwd, busy: () => busy }
}
