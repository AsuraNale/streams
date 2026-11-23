/**
 * 1.1 W6b: building a library — and changing a library's card — as one conversation with the main agent (core createBuild;
 * the build SOP, the two web tools; acceptance A1, A2, B3). (v1.0's 新建库 form went in W7b; so did v2's main agent chat: the
 * sidebar's 主 Agent opens this conversation.)
 *   - One conversation at a time, kept in <appData>\build\build.json after every turn, so it is there again after leaving
 *     the page or a restart. Its card waits as a pending action in <appData>\build\pending (create_library, or edit_card for
 *     a change) — nothing is made or changed until 确认 (B3). 不建了 takes the card back and ends the conversation.
 *   - Only Claude Code builds in 1.1 (W4's live runs: Codex did not pass, contract C7): another connection does not start,
 *     with the code 'build-not-supported'; none chosen: 'no_connection'.
 *   - The agent's session has the two web tools (core createSessionConnector … { web: true }) in a working folder of its own
 *     under the system's temporary folder.
 *   - A new library goes to <libraryRoot>\<the card's name as a folder name> (a free name: ' 2', ' 3' … when that folder is
 *     there already); once made it is registered and becomes the current library (services/library.mjs adopt).
 *
 *   getBuild()                       → the view (below) or null
 *   startBuild(opener, libraryId?)   → the view after the agent's first turn; with libraryId: a change of that library's card,
 *                                      or (1.1 W7a) for a library without one (made by the last version) bringing it over:
 *                                      the card is convert_library and goes into that library's own folder on 确认
 *   replyBuild(answer)               → the view after the next turn; answer: a string, or { picked: [option], other }
 *   retryBuild()                     → the turn that failed (the connection), sent again
 *   confirmBuild()                   → { done: true, libraryId } — the library made (or its card changed)
 *   dropBuild()                      → null — 不建了 / 不改了
 * The view: { mode: 'create' | 'edit' | 'convert', library: { id, name } | null, status: 'talking' | 'stopped', opener, asked, busy,
 *   stopped: notice | null, trouble: { code } | null, turns: [{ role: 'you', text } | { role: 'agent', kind, say, question?,
 *   card?, before?, changes?, urls?, canConfirm?, problems?, notice? }] } (changes: [{ key, before, after }], core cardChanges) — the agent's turns as createBuild gave them, its notes to itself
 *   left out. Each change sends `build-changed { phase }` (started · done · ended).
 * Development and tests only (not in a packaged app; main.mjs reads it): STREAMS_DEV_BUILD, a JSON file
 * { replies: [{ json, reads?, searches?, ok?, code? }] } — the agent's session answers the n-th call with the n-th reply.
 * @module desktop/main/services/build
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BridgeError } from '../bridge-methods.mjs'
import {
  cardChanges, cardHandlers, cardUrls, createActionRunner, createBuild, createSessionConnector, libraryFolderName, loadDefinition, readCard,
} from '../core.mjs'

export const BUILD_KINDS = Object.freeze(['claude-code'])
export const BUILD_CWD = join(tmpdir(), 'streams-build-cwd')
const OPENER_MAX = 2000

// with the development connection and no script: one question with no options, and nothing more (never the real command line)
export const DEV_BUILD_REPLIES = Object.freeze([{ json: { say: '', question: { text: 'What will you use it for?', kind: 'input' } } }])

/**
 * A stand-in for the agent's session (STREAMS_DEV_BUILD): the n-th call gets the n-th reply (n = the build's calls so far).
 * file null: DEV_BUILD_REPLIES (main.mjs: STREAMS_DEV_CONNECTION without STREAMS_DEV_BUILD).
 */
export function devBuildSession(file, callsSoFar) {
  return {
    async send() {
      let replies = []
      if (file === null) replies = DEV_BUILD_REPLIES
      else try { replies = JSON.parse(readFileSync(file, 'utf8')).replies ?? [] } catch { replies = [] }
      const r = replies[Math.min(callsSoFar(), replies.length - 1)] ?? { ok: false, code: 'failed' }
      if (r.ok === false) return { ok: false, code: r.code ?? 'failed', sessionId: 'dev-build', reads: [], searches: [], otherTools: [] }
      // words that are not JSON (the core sends them back once, then stops the build)
      if (typeof r.text === 'string') return { ok: false, code: 'bad-format', text: r.text, sessionId: 'dev-build', reads: [], searches: [], otherTools: [] }
      return { ok: true, json: r.json, text: JSON.stringify(r.json), sessionId: 'dev-build', resumed: callsSoFar() > 0, reads: r.reads ?? [], searches: r.searches ?? [], otherTools: [] }
    },
  }
}

/**
 * @param {object} o
 * @param {string} o.appDataDir
 * @param {object} o.library - services/library.mjs (find, adopt, current)
 * @param {object} o.connections - services/connections.mjs (active)
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => string} o.libraryRoot - where a new library goes
 * @param {() => {resolved: string}} [o.locale]
 * @param {() => Date} [o.now]
 * @param {(active: object, callsSoFar: () => number) => object} [o.session] - the agent's session for the active connection
 */
export function createBuildService({ appDataDir, library, connections, emit, log, libraryRoot, locale = () => ({ resolved: 'zh-CN' }), now = () => new Date(), session = active => createSessionConnector(active.connection, {}, { cwd: BUILD_CWD, web: true }) }) {
  const dir = join(appDataDir, 'build')
  const file = join(dir, 'build.json')
  const pendingDir = join(dir, 'pending')
  const definition = loadDefinition()
  // the conversation: core state + what this service adds (stopped, trouble, the call to try again)
  let saved = null
  let build = null
  let busy = false

  const read = () => {
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  }
  const write = () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(saved, null, 1))
  }
  /** The conversation ends: its file is kept beside, under the time it ended. */
  const end = why => {
    if (existsSync(file)) {
      const stamp = now().toISOString().replace(/[:.]/g, '-')
      try { renameSync(file, join(dir, `ended-${stamp}-${why}.json`)) } catch (err) { log(`build: the ended conversation not kept: ${String(err?.message ?? err)}`) }
    }
    saved = null
    build = null
    emit('build-changed', { phase: 'ended' })
  }

  const dirOfLibrary = id => {
    const l = library.find(id)
    if (!l) throw new BridgeError('bad_arguments', `no library ${id}`)
    return l.path
  }
  /** A free folder for a new library named `name`. */
  const folderFor = name => {
    const base = join(libraryRoot(), libraryFolderName(name))
    let p = base
    for (let i = 2; existsSync(p) && readdirSync(p).length > 0; i++) p = `${base} ${i}`
    return p
  }
  const runner = () => createActionRunner({
    definition,
    handlers: cardHandlers({ libraryDirFor: card => folderFor(card.name), dirOfLibrary, language: locale().resolved }),
    pendingDir,
    logFile: (action, params, result) => join(result.object.id, '_actions.jsonl'),
    now,
  })

  const activeOrRefuse = () => {
    const active = connections.active()
    if (!active) throw new BridgeError('no_connection')
    if (!BUILD_KINDS.includes(active.kind)) throw new BridgeError('bad_arguments', 'build-not-supported')
    return active
  }
  /** The core's conversation for the saved state (made again after a restart). */
  const conversation = () => {
    if (build) return build
    if (!saved) return null
    const active = activeOrRefuse()
    build = createBuild({ connector: session(active, () => saved?.core?.calls ?? 0), definition, runner: runner(), kind: active.kind, language: saved.core.language, state: saved.core, now })
    return build
  }

  const view = () => {
    if (!saved) return null
    const s = saved.core
    const turns = []
    for (const t of s.turns) {
      if (t.role === 'user') turns.push({ role: 'you', text: t.text })
      else if (t.role === 'agent') {
        const a = { role: 'agent', kind: t.kind, say: t.say ?? '' }
        if (t.question) a.question = t.question
        if (t.card) {
          a.card = t.card; a.before = t.before ?? null; a.canConfirm = t.canConfirm === true; a.problems = t.problems ?? []
          // A2: the lines that changed from the card before (the page names them in its words); how many addresses the card has
          a.changes = a.before ? cardChanges(a.before, t.card).map(c => ({ key: c.key, before: c.before, after: c.after })) : null
          try { a.urls = cardUrls(t.card).length } catch { a.urls = 0 }
        }
        if (t.notice) a.notice = t.notice
        turns.push(a)
      }
    }
    // the card that can be confirmed is the last one, while it still waits
    const last = [...turns].reverse().find(t => t.role === 'agent' && t.kind === 'card')
    if (last && !s.pendingId) last.canConfirm = false
    return {
      mode: s.edit ? 'edit' : s.convert ? 'convert' : 'create',
      library: s.edit || s.convert ? { id: (s.edit ?? s.convert).library, name: library.find((s.edit ?? s.convert).library)?.name ?? null } : null,
      status: saved.stopped ? 'stopped' : 'talking',
      opener: s.opener,
      asked: s.asked.length,
      busy,
      stopped: saved.stopped ?? null,
      trouble: saved.trouble ?? null,
      turns,
    }
  }

  /** One turn of the agent: the state saved after it, the events around it. */
  const turn = async (how, arg) => {
    if (busy) throw new BridgeError('busy')
    busy = true
    emit('build-changed', { phase: 'started' })
    try {
      const b = conversation()
      const out = how === 'start' ? await b.start(arg) : await b.reply(arg)
      saved.core = b.state()
      saved.trouble = out.kind === 'failed' ? { code: out.code ?? 'failed' } : null
      saved.retry = out.kind === 'failed' ? { how, arg } : null
      if (out.kind === 'stopped') saved.stopped = out.notice
      log(`build: ${how}: ${out.kind}${out.notice ? ` (${out.notice})` : ''}${out.code ? ` (${out.code})` : ''} · calls ${saved.core.calls}`)
    } catch (err) {
      if (err instanceof BridgeError) throw err
      log(`build: ${how} failed: ${String(err?.stack ?? err)}`)
      saved.trouble = { code: 'internal' }
      saved.retry = { how, arg }
    } finally {
      busy = false
      if (saved) write()
      emit('build-changed', { phase: 'done' })
    }
    return view()
  }

  saved = read()
  if (saved) log(`build: a conversation read back (${saved.core?.turns?.length ?? 0} lines)`)

  const handlers = {
    getBuild() {
      return view()
    },
    async startBuild(opener, libraryId) {
      if (saved && !saved.stopped) throw new BridgeError('bad_arguments', 'a build is going')
      const text = String(opener).trim()
      if (!text || text.length > OPENER_MAX) throw new BridgeError('bad_arguments', 'what to follow')
      const active = activeOrRefuse()
      let edit = null
      let convert = null
      if (libraryId !== undefined && libraryId !== null) {
        const card = readCard(dirOfLibrary(libraryId))
        if (card) edit = { library: libraryId, card }
        else convert = { library: libraryId }
      }
      if (saved) end('stopped')
      build = createBuild({ connector: session(active, () => saved?.core?.calls ?? 0), definition, runner: runner(), kind: active.kind, language: locale().resolved, now, edit, convert })
      saved = { v: 1, core: build.state(), stopped: null, trouble: null, retry: null }
      return turn('start', text)
    },
    async replyBuild(answer) {
      if (!saved) throw new BridgeError('bad_arguments', 'no build')
      if (saved.stopped) throw new BridgeError('bad_arguments', 'this build stopped')
      if (saved.core.status === 'new') throw new BridgeError('bad_arguments', 'use retryBuild')
      return turn('reply', answer)
    },
    async retryBuild() {
      if (!saved?.retry) throw new BridgeError('bad_arguments', 'nothing to try again')
      const { how, arg } = saved.retry
      return turn(how, arg)
    },
    async confirmBuild() {
      if (!saved) throw new BridgeError('bad_arguments', 'no build')
      if (busy) throw new BridgeError('busy')
      const b = conversation()
      const out = await b.confirm().catch(err => { log(`build: confirm: ${String(err?.message ?? err)}`); throw new BridgeError('bad_arguments', 'nothing to confirm') })
      if (out.status !== 'done') {
        saved.core = b.state()
        write()
        log(`build: confirm: ${out.status}`)
        throw new BridgeError('bad_arguments', `not done: ${out.status}`)
      }
      const path = b.state().libraryDir
      const edit = saved.core.edit ?? saved.core.convert ?? null
      let libraryId
      if (edit) {
        // a card changed, or a library of the last version brought over: the same library, its folder and registration
        libraryId = edit.library
        emit('library-changed', library.current())
      } else {
        const lib = library.adopt(path, { name: b.state().card?.name })
        libraryId = lib?.libraryId ?? null
      }
      log(`build: ${saved.core.convert ? 'library brought over' : edit ? 'card changed' : 'library made'}: ${path}`)
      end('built')
      return { done: true, libraryId }
    },
    dropBuild() {
      if (busy) throw new BridgeError('busy')
      if (!saved) return null
      try { conversation()?.drop() } catch { /* the connection may be gone: the pending card is taken back below */ }
      try { const r = runner(); for (const p of r.pending()) r.reject(p.id) } catch (err) { log(`build: pending not taken back: ${String(err?.message ?? err)}`) }
      end('dropped')
      return null
    },
  }
  return { handlers }
}
