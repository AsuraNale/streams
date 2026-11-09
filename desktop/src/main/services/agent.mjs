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
 * 「要」 on a suggestion card (acceptSuggestion) does exactly two things: the accept is recorded (core acceptSuggestion, the
 * library's _pipeline/suggestions.jsonl) and the card is handed to the agent as a `note` for one turn — the agent decides
 * whether to propose a card. Nothing of the library's configuration is touched here.
 *
 * Events: `agent-changed { phase: 'started' | 'done', turn, libraryId }` at the start and the end of every turn.
 *
 * Development and tests only (a packaged app ignores them; main.mjs reads the variables):
 *   STREAMS_DEV_CONNECTION=fake           the agent talks to the core's scripted stand-in (scriptedAgentConnector), whatever
 *                                         connection is chosen; login-expired / bad-format-once: the stand-in fails the
 *                                         same way (every call / the first call)
 *   STREAMS_DEV_AGENT_SCRIPT=<json file>  its answers, in order: [answer, …] or { answers: [...] } (each an object = the
 *                                         model's JSON; { $text } raw text; { $fail: code }; { $lost: true }); read once
 * Pure Node apart from what is injected, so the rules run in plain Node (test/services-agent.test.mjs).
 * @module desktop/main/services/agent
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { BridgeError, bridgeErrorOf } from '../bridge-methods.mjs'
import { isInside } from '../layout.mjs'
import {
  AGENT_CWD, AGENT_DIR, acceptSuggestion, acceptedSuggestionNote, agentTurn, dismissSuggestion, lastSummary, nextTurn, openSuggestions, readSessions, readTranscript,
  recordSuggestions, scriptedAgentConnector, suggestFor,
} from '../core.mjs'

export const TRANSCRIPT_PAGE = 100

/**
 * @param {object} o
 * @param {string} o.appDataDir - layout.appData: the agent's folder goes there
 * @param {object} o.library - services/library.mjs (entries, find, entryOf, usable)
 * @param {object} o.connections - services/connections.mjs (active, sessionConnector, devConnection)
 * @param {{createProposal: Function, handlers: {listProposals: Function}}} o.proposals - services/proposals.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 * @param {() => {resolved: string}} [o.locale] - the language of the note an accepted suggestion becomes
 * @param {string|null} [o.devScript] - STREAMS_DEV_AGENT_SCRIPT
 * @param {string} [o.cwd] - the CLI connections' working folder: absolute, never inside appDataDir (default core AGENT_CWD)
 * @throws {TypeError} a cwd that is not absolute or that is inside the app data
 */
export function createAgentService({ appDataDir, library, connections, proposals, emit, log, now = () => new Date(), locale = () => ({ resolved: 'zh-CN' }), devScript = null, cwd = AGENT_CWD }) {
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

  /** One turn: `as` 'you' (the page's sentence) or 'note' (an accepted suggestion). */
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
        r = await agentTurn({ text, libraryId, as }, { agentDir, connector: c, registry, proposals: cards, createProposal: proposals.createProposal, now, log })
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

  /** The open suggestion cards of one library (by id) or of every readable one, oldest first within a library. */
  const suggestionsOf = libraryId => {
    const libs = libraryId ? [library.entryOf(libraryId)] : library.entries()
    const out = []
    for (const l of libs) {
      if (!library.usable(l.path)) continue
      let open = []
      try { open = openSuggestions(l.path) } catch (err) { log(`agent: suggestions of ${l.id} unreadable: ${String(err?.message ?? err)}`) }
      for (const s of open) out.push({ libraryId: l.id, key: s.key, kind: s.kind, subject: s.subject, ...(s.libraryId ? { otherLibraryId: s.libraryId } : {}), evidence: s.evidence, createdAt: s.createdAt })
    }
    return out
  }

  /** The note an accepted suggestion becomes (core acceptedSuggestionNote): what the card says, for the agent to decide on. */
  const noteOf = (entry, s) => acceptedSuggestionNote({ libraryName: entry.name, libraryId: entry.id, kind: s.kind, subject: s.subject, evidence: s.evidence }, locale().resolved === 'en' ? 'en' : 'zh')

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
      const entries = upTo.slice(-limit)
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
    /** 「不要」: one line in the library's suggestions.jsonl; nothing else. */
    dismissSuggestion(libraryId, key, reason) {
      const e = library.entryOf(libraryId)
      try {
        const line = dismissSuggestion(e.path, key, { ...(typeof reason === 'string' && reason.trim() !== '' ? { reason: reason.trim() } : {}), now })
        log(`agent: suggestion ${key} of ${libraryId} dismissed`)
        return line
      } catch (err) { throw bridgeErrorOf(err) }
    },
    /** 「要」: the accept recorded, then the card handed to the agent for one turn (as a note). Nothing else changes. */
    async acceptSuggestion(libraryId, key) {
      const e = library.entryOf(libraryId)
      const s = suggestionsOf(libraryId).find(x => x.key === key)
      if (!s) throw new BridgeError('bad_arguments', `no open suggestion ${key} in ${libraryId}`)
      if (!connector()) throw new BridgeError('no_connection')
      let line
      try { line = acceptSuggestion(e.path, key, { now }) } catch (err) { throw bridgeErrorOf(err) }
      log(`agent: suggestion ${key} of ${libraryId} accepted; handed to the agent`)
      const t = await turn(noteOf(e, s), { libraryId, as: 'note' })
      return { accepted: line, turn: t }
    },
  }

  /** After a round of the pipeline (services/pipeline.mjs afterRound): the library's rule-based suggestion cards recorded. */
  function afterRound({ dir, libraryId = null }) {
    const otherLibraries = library.entries().filter(l => l.id !== libraryId && l.path !== dir && library.usable(l.path)).map(l => ({ libraryId: l.id, dir: l.path }))
    const { written } = recordSuggestions(dir, suggestFor(dir, { now, otherLibraries }), { now })
    log(`agent: after the round of ${libraryId ?? dir}: ${written.length} new suggestion card${written.length === 1 ? '' : 's'}${written.length ? ` (${written.map(w => w.key).join(', ')})` : ''}`)
    return written
  }

  return { handlers, afterRound, agentDir, cwd, busy: () => busy }
}
