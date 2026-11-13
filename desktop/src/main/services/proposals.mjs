/**
 * Proposal cards in the main process (v2 package B; docs/desktop.md §4.5, docs/core-api.md 5.13; docs/design/v2/architecture.md
 * 2.2, 2.5): a change to a library, or a new library, put forward by someone other than the user — the main agent (package
 * C) through `createProposal`, which is not on the bridge; today only the development hook — and made to happen only by the
 * user's 「确认」 (`confirmProposal`). 「不要」 and 「改一下」 only write the card's new status; nothing else changes.
 *
 * The cards and their history are the core's (core proposals): made with draftProposal (params checked, the change tried on
 * a copy, before / after worked out by the code, a source tried once, the baseHash), decided with confirmProposal /
 * declineProposal / reviseProposal (only a pending card: anything else is not-pending → bad_arguments, and nothing is
 * done). Each card when it is made and at every change of status is one line of <appData>\proposals.jsonl, and of its
 * library's _pipeline\proposals.jsonl (a new library's card: of the new library's, once it is made); at start the cards
 * are read back from the app's one (the last line of each id; a bad line skipped). Every change sends
 * `proposals-changed { libraryId, id, status }` (libraryId null for a create_library card).
 *
 * What a confirm does beyond streams.json goes through package A's services, as the core's hooks:
 *   register  services/library.mjs adopt: the new library registered under its name and made the current one
 *   unregister  services/library.mjs forget (the undo when a later step failed; the library current before is again)
 *   enqueue   services/schedule.mjs queueRound: one round of that library in the app's one queue
 * A confirmed edit_schedule arms the timer again (and sends settings-changed { libraryId }, as setSchedule does); a confirmed
 * change of the current library sends library-changed.
 *
 * Where a new library goes when its card names no folder: `libraryRoot()` (main.mjs: settings.json's libraryRoot, else the
 * default place) \ <the name as a folder name>. Development and tests only (a packaged app ignores it; main.mjs reads it):
 *   STREAMS_DEV_PROPOSALS   a JSON file: [{ kind, params, why }] (or { proposals: [...] }) made into pending cards by: 'dev'
 *                           at start (`loadDev`); a library kind without params.libraryId takes the current library's
 * Redesign R5a (O9; docs/desktop.md §4.19): what the bridge hands the page of a card — listProposals, and the card each answer
 * gives back — has its trials and its failure without the raw texts (public-data.mjs publicCard: a state or a kind of failure and
 * the key of what to do); the texts go to the log and 「复制诊断信息」 (raw-errors.mjs). A confirmed card is told to
 * `afterConfirmed` (main.mjs: services/agent.mjs afterProposal — a confirmed 暂停该来源 expires that source's 系统检测 ① ③).
 * Pure Node apart from what is injected, so the rules run in plain Node (test/services-proposals.test.mjs).
 * @module desktop/main/services/proposals
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BridgeError, bridgeErrorOf } from '../bridge-methods.mjs'
import { publicCard } from '../public-data.mjs'
import {
  LIBRARY_KINDS, PROPOSALS_FILE, StreamsError, appendProposal, confirmProposal, declineProposal, draftProposal, libraryProposalsPath,
  readProposals, reviseProposal, whoDecided,
} from '../core.mjs'

/**
 * @param {object} o
 * @param {string} o.appDataDir - layout.appData: proposals.jsonl goes there
 * @param {object} o.library - services/library.mjs (find, usable, current, require, adopt, forget)
 * @param {() => ({queueRound: Function, arm: Function}|null)} o.scheduler - services/schedule.mjs, once it is made
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 * @param {object} [o.fetchContext] - overrides for the core's fetch context of the trials (tests: a local server's timeouts)
 * @param {() => string|null} [o.libraryRoot] - the default place of a new library
 * @param {() => object|null} [o.fallbackSchedule] - what a new library's schedule is when the card gives none (settings.json's)
 * @param {() => {resolved: string}} [o.locale] - the language of a new library's default prompts
 * @param {string|null} [o.devProposals] - STREAMS_DEV_PROPOSALS
 * @param {string} [o.scratchRoot] - where the core tries a change on a copy (default the OS temp folder)
 * @param {(card: object) => void} [o.afterConfirmed] - redesign R5a: after a card was confirmed (services/agent.mjs afterProposal)
 * @param {{note: Function}|null} [o.rawErrors] - redesign R5a (O9): raw-errors.mjs
 */
export function createProposalsService({ appDataDir, library, scheduler = () => null, emit, log, now = () => new Date(), fetchContext = {}, libraryRoot = () => null, fallbackSchedule = () => null, locale = () => ({ resolved: 'zh-CN' }), devProposals = null, scratchRoot, afterConfirmed = () => {}, rawErrors = null }) {
  const file = join(appDataDir, PROPOSALS_FILE)
  // id → the card as it is now; the order the cards came in
  const cards = new Map()
  const loaded = readProposals(file)
  for (const c of loaded.cards) cards.set(c.id, c)
  log(`proposals: ${cards.size} cards read back${loaded.skipped ? `, ${loaded.skipped} bad lines skipped` : ''} (${[...cards.values()].filter(c => c.status === 'pending').length} pending)`)

  /** A card's new state: one line in the app's record and its library's, kept here, said to the page. */
  const persist = (card, { alsoIn = null } = {}) => {
    appendProposal(file, card)
    const dirs = []
    const e = card.libraryId ? library.find(card.libraryId) : null
    if (e) dirs.push(e.path)
    if (alsoIn) dirs.push(alsoIn)
    for (const d of dirs) {
      try { appendProposal(libraryProposalsPath(d), card) } catch (err) { log(`proposals: ${card.id} not recorded in ${d}: ${String(err?.message ?? err)}`) }
    }
    cards.set(card.id, card)
    emit('proposals-changed', { libraryId: card.libraryId ?? null, id: card.id, status: card.status })
    return card
  }

  const known = id => {
    const c = cards.get(id)
    if (!c) throw new BridgeError('bad_arguments', `no proposal ${String(id)}`)
    return c
  }

  /**
   * A new pending card (package C's main agent; the development hook). Not on the bridge.
   * @param {string} kind - core PROPOSAL_KINDS
   * @param {object} params - the kind's (core checkParams); a library kind names its library by registry id
   * @param {string} why
   * @param {{by?: 'agent'|'dev'}} [o]
   * @returns {Promise<object>} the card
   * @throws {StreamsError} bad-proposal (an unknown library: reason 'unknown-library')
   */
  async function createProposal(kind, params, why, { by = 'agent' } = {}) {
    let libraryDir = null
    if (LIBRARY_KINDS.includes(kind)) {
      const id = params?.libraryId
      const e = typeof id === 'string' ? library.find(id) : null
      if (!e || !library.usable(e.path)) throw new StreamsError('bad-proposal', `no readable library ${String(id)}`, { reason: 'unknown-library' })
      libraryDir = e.path
    }
    const card = await draftProposal({ kind, params, why, by }, {
      libraryDir, libraryRoot: libraryRoot(), fallbackSchedule: fallbackSchedule(), language: locale().resolved, ctx: { ...fetchContext }, now,
      ...(scratchRoot ? { scratchRoot } : {}),
    })
    persist(card)
    log(`proposals: ${card.id} ${card.kind} by ${card.by}${card.libraryId ? ` for ${card.libraryId}` : ` at ${card.params.folder}`}: pending`)
    return card
  }

  /** After a confirm: the timer again for a schedule, the page told when its library changed. */
  const afterConfirm = card => {
    if (card.status !== 'confirmed' || !card.libraryId) return
    if (card.kind === 'edit_schedule') {
      try { scheduler()?.arm() } catch (err) { log(`proposals: the timer not armed again: ${String(err?.message ?? err)}`) }
      emit('settings-changed', { libraryId: card.libraryId })
    }
    if (card.kind !== 'run_round' && library.current()?.libraryId === card.libraryId) emit('library-changed', library.current())
    try { afterConfirmed(card) } catch (err) { log(`proposals: after ${card.id}: ${String(err?.message ?? err)}`) }
  }
  /** Redesign R5a (O9): the card as the page may see it. */
  const shown = card => publicCard(card, { raw: rawErrors })

  const handlers = {
    /** The cards, newest first; `filter` null or { status?, libraryId? } (libraryId null: the create_library cards). */
    listProposals(filter) {
      const f = filter ?? {}
      return [...cards.values()].reverse().filter(c => (f.status === undefined || c.status === f.status) && (f.libraryId === undefined || c.libraryId === f.libraryId)).map(shown)
    },
    /** 「确认」: the only call that changes anything. A card not pending → bad_arguments, nothing done. */
    confirmProposal(id) {
      const card = known(id)
      const entry = card.libraryId ? library.find(card.libraryId) : null
      const before = library.current()?.libraryId ?? null
      let next
      try {
        next = confirmProposal(card, {
          libraryDir: entry && library.usable(entry.path) ? entry.path : null,
          language: locale().resolved,
          now,
          hooks: {
            register: (folder, { name }) => library.adopt(folder, { name }),
            unregister: libraryId => library.forget(libraryId, before),
            enqueue: libraryId => {
              const e = library.find(libraryId)
              const s = scheduler()
              if (!e || !s) throw new Error(`no ${e ? 'queue' : `library ${libraryId}`}`)
              return s.queueRound(e, `proposal ${card.id}`)
            },
          },
        })
      } catch (err) {
        throw bridgeErrorOf(err)
      }
      persist(next, { alsoIn: next.kind === 'create_library' ? next.result?.folder ?? null : null })
      log(`proposals: ${id} ${next.kind}: ${next.status}${next.reason ? ` (${next.reason})` : ''}${next.failure ? ` at ${next.failure.step}` : ''}`)
      if (next.failure) rawErrors?.note(`proposal ${id} ${next.kind} failed at ${next.failure.step ?? '?'}`, { message: next.failure.message, code: next.failure.code })
      afterConfirm(next)
      return shown(next)
    },
    /** 「不要」: the card declined; nothing else changes. */
    declineProposal(id) {
      let next
      try { next = declineProposal(known(id), { now }) } catch (err) { throw bridgeErrorOf(err) }
      log(`proposals: ${id}: declined`)
      return shown(persist(next))
    },
    /** 「改一下」: the card goes back with the user's words (package C makes a new one from them); nothing else changes. */
    reviseProposal(id, text) {
      let next
      try { next = reviseProposal(known(id), text, { now }) } catch (err) { throw bridgeErrorOf(err) }
      log(`proposals: ${id}: sent back to be revised`)
      return shown(persist(next))
    },
    /** 「谁定的」 of the current library: each field's last change, by 'you' or 'agent-confirmed', or null. */
    getWhoDecided() {
      const dir = library.require()
      try { return whoDecided(dir) } catch (err) { throw bridgeErrorOf(err) }
    },
  }

  /** STREAMS_DEV_PROPOSALS: the file's cards made, by 'dev' (a card that does not fit is said in the log and skipped). */
  async function loadDev() {
    if (!devProposals) return []
    let data
    try { data = JSON.parse(readFileSync(devProposals, 'utf8')) } catch (err) { log(`proposals: ${devProposals} unreadable: ${String(err?.message ?? err)}`); return [] }
    const items = Array.isArray(data) ? data : Array.isArray(data?.proposals) ? data.proposals : []
    const made = []
    for (const [i, p] of items.entries()) {
      try {
        const params = { ...(p?.params ?? {}) }
        if (LIBRARY_KINDS.includes(p?.kind) && params.libraryId === undefined) params.libraryId = library.current()?.libraryId
        made.push(await createProposal(p?.kind, params, p?.why, { by: 'dev' }))
      } catch (err) {
        log(`proposals: development card ${i} not made: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
      }
    }
    log(`proposals: ${made.length} of ${items.length} development cards made`)
    return made
  }

  return { handlers, createProposal, loadDev, card: id => cards.get(id) ?? null }
}
