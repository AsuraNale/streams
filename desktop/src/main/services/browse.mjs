/**
 * The library and reading (plan S6 / S7; docs/desktop.md §四 「资料库」, §4.2): the four tabs with their counts, the search,
 * one note with its right column, the edit, the note in Obsidian. The page names a note by its id only, and the id must be
 * in the index before anything is read or written; a path is never taken from the page — the core's `notePath` gives it.
 * Shapes are the core's (docs/core-api.md §5.1–5.3); `getLibrary` adds the counts.
 *
 * 待规范 (plan A3, mockup S8; docs/desktop.md §4.3): `applyHeader(file, header)` writes one header onto a file the core lists
 * as needing one (the core's applyProposedHeader, which writes through writeNoteFile by:'import-header': the body stays
 * byte for byte); `applyAllHeaders()` does it with the proposed header for every file that has one. The page names a file
 * by its name only, and the name must be in the core's list before the core is asked to write.
 *
 * The core's functions are reached by name through `coreCaller` (bridge-methods.mjs), so a stand-in core can be given in
 * the tests and a function the core does not have yet is `internal`, not a failed import. Pure Node apart from what is
 * injected (`shell`): test/services-browse.test.mjs.
 * @module desktop/main/services/browse
 */

import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'

/** v2 package L: the folder of the library's program records (the core's own files: the inbox, the logs, the cache). */
const PROGRAM_RECORDS = '_pipeline'

/** `{ topics?, days? }` as the core takes it (the bridge has checked the shape). */
const filterOf = (f, keys) => {
  const out = {}
  if (f && typeof f === 'object') for (const k of keys) if (f[k] !== undefined) out[k] = f[k]
  return out
}

/** The path is inside `dir` by its text (no `..`, not another drive). */
export const inside = (dir, path) => {
  const rel = relative(dir, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * @param {object} o
 * @param {{require: () => string, current: () => {path: string, name: string}|null}} o.library - services/library.mjs
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: nothing is opened outside the app
 * @param {{openExternal: (url: string) => Promise<void>, openPath: (path: string) => Promise<string>, showItemInFolder: (path: string) => void}} o.shell
 * @param {Record<string, unknown>} [o.core] - the core's exports (tests: a stand-in for what is not there yet)
 * @param {() => Date} [o.now]
 */
export function createBrowseService({ library, emit, log, hidden = false, shell, core = realCore, now = () => new Date() }) {
  const call = coreCaller(core)

  /** The open library and an id the index knows, or bad_arguments. */
  const known = id => {
    const dir = library.require()
    if (!call('readIndex', dir).some(e => e.id === id)) throw new BridgeError('bad_arguments', `not in the index: ${id}`)
    return dir
  }

  /** The file of a note the index knows: the core's notePath, checked to be a .md file of the note folder (notes/ or, for an
   *  imported folder, the library folder itself: core notesDir). */
  const noteFile = id => {
    const dir = known(id)
    const path = call('notePath', dir, id)
    const folder = call('notesDir', dir)
    if (typeof path !== 'string' || !isAbsolute(path) || !inside(dir, path) || !/\.md$/i.test(path) || resolve(dirname(path)) !== resolve(folder)) throw new BridgeError('internal', `notePath gave a path that is not a note of the note folder: ${String(path)}`)
    return path
  }

  /** The open library and a file the core lists as needing a header, or bad_arguments. */
  const pendingFile = file => {
    const dir = library.require()
    const row = call('listPending', dir).find(p => p.file === file)
    if (!row) throw new BridgeError('bad_arguments', `not a file that needs a header: ${file}`)
    return { dir, row }
  }

  const handlers = {
    getLibrary(view, filter) {
      const dir = library.require()
      const listed = call('listLibrary', dir, { view, ...filterOf(filter, ['topics', 'days']), now })
      // redesign R3 (缺少文件头, P12): each file with its path in the library folder (notes\<file>, or <file> for an imported folder)
      if (view === 'pending' && Array.isArray(listed.items)) {
        const folder = call('notesDir', dir)
        listed.items = listed.items.map(it => ({ ...it, path: relative(dir, join(folder, it.file)) }))
      }
      return { counts: call('libraryCounts', dir), ...listed }
    },
    searchLibrary(q, filter) {
      const dir = library.require()
      return call('search', dir, q, { ...filterOf(filter, ['view', 'topics', 'days']), now })
    },
    // redesign R3: and where the file is, relative to the library's folder (资料库's 详情 「文件」: notes\<id>.md)
    readNote(id) {
      const dir = known(id)
      const note = call('readNote', dir, id)
      return { ...note, path: relative(dir, noteFile(id)) }
    },
    editNote(id, changes) {
      const dir = known(id)
      const r = call('editNote', dir, id, changes)
      log(`browse: edited ${id} (${Object.keys(changes).join(', ')})`)
      emit('library-changed', library.current())
      return { id: r.id, file: r.file, entry: r.entry }
    },
    async openInObsidian(id) {
      const path = noteFile(id)
      if (hidden) { log(`not opened in a test run: obsidian ${path}`); return null }
      try {
        await shell.openExternal(`obsidian://open?path=${encodeURIComponent(path)}`)
        return null
      } catch (err) {
        log(`browse: obsidian:// not opened (${String(err?.message ?? err)}); the file with its own program instead`)
      }
      const problem = await shell.openPath(path)
      if (problem) { log(`browse: openPath ${path}: ${problem}`); throw new BridgeError('open_failed') }
      return null
    },
    // v2 package H: 「在资源管理器中显示」 — the note's file selected in its folder (only a note of the index has a file)
    showNoteInFolder(id) {
      const path = noteFile(id)
      if (hidden) { log(`not opened in a test run: folder ${path}`); return null }
      shell.showItemInFolder(path)
      return null
    },
    /**
     * v2 package L (the right panel's 「文件」): the current library as a structure told to a person — read only, nothing
     * written. The notes (kept and the user's own, from the index) grouped by the topics in their headers (a note with two
     * topics is in both groups; one with none in the group `topic: null`, 「未分主题」), the biggest group first; how many wait in
     * 待看; whether there is the library's 「要求与来源」 (its sources and topics: counts only). No file name and no path of the
     * program's own files is given: the page shows none (V7), and never opens streams.json itself.
     */
    getLibraryOutline() {
      const dir = library.require()
      const index = call('readIndex', dir).filter(e => e.status === 'kept' || e.status === 'authored')
      const groups = new Map()
      // 1.1.1 P11b (场景四②): a note kept from a library made by a card has no topic of its own — keep gives it the fallback
      // 「未分类」 / "uncategorized" (core FALLBACK_TOPIC) — so it counts as having none (the group `topic: null`), not as a topic
      const fallback = new Set(Object.values(core.FALLBACK_TOPIC ?? {}))
      const put = (topic, e) => { if (!groups.has(topic)) groups.set(topic, []); groups.get(topic).push({ id: e.id, title: e.title ?? e.id, status: e.status, date: e.date ?? null }) }
      for (const e of index) {
        const topics = [...new Set((Array.isArray(e.topics) ? e.topics : []).filter(t => typeof t === 'string' && t.trim() !== '').map(t => t.trim()).filter(t => !fallback.has(t)))]
        if (topics.length) for (const t of topics) put(t, e)
        else put(null, e)
      }
      const byDate = (a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(a.title).localeCompare(String(b.title))
      const list = [...groups].map(([topic, notes]) => ({ topic, count: notes.length, notes: notes.sort(byDate) }))
        .sort((a, b) => (a.topic === null) - (b.topic === null) || b.count - a.count || String(a.topic).localeCompare(String(b.topic)))
      let inbox = 0
      try { inbox = call('listInbox', dir).length } catch (err) { log(`browse: outline: the inbox unreadable: ${String(err?.message ?? err)}`) }
      let sources = 0
      let topics = 0
      try { const cfg = call('readConfig', dir).config ?? {}; sources = (cfg.sources ?? []).length; topics = (cfg.topics ?? []).length } catch (err) { log(`browse: outline: the configuration unreadable: ${String(err?.message ?? err)}`) }
      const cur = library.current()
      return { libraryId: cur?.libraryId ?? null, name: cur?.name ?? null, notes: { count: index.length, groups: list }, inbox: { count: inbox }, requirements: { sources, topics } }
    },
    /** v2 package L: 「程序记录（不用动）」 → its folder selected in the file manager (only that; nothing in it is listed or opened). */
    revealProgramRecords() {
      const path = join(library.require(), PROGRAM_RECORDS)
      if (hidden) { log(`not opened in a test run: folder ${path}`); return null }
      shell.showItemInFolder(path)
      return null
    },
    applyHeader(file, header) {
      const { dir } = pendingFile(file)
      const r = call('applyProposedHeader', dir, file, { header: header ?? undefined })
      log(`browse: header written onto ${file} (${header ? 'changed by the user' : 'as proposed'})`)
      emit('library-changed', library.current())
      return { id: r.id, file: r.file, entry: r.entry }
    },
    applyAllHeaders() {
      const dir = library.require()
      const rows = call('listPending', dir)
      const apply = core.applyProposedHeader
      if (typeof apply !== 'function') throw new BridgeError('internal', 'the core has no function applyProposedHeader')
      const written = []
      const skipped = []
      for (const row of rows) {
        if (!row.nameOk) { skipped.push({ file: row.file, code: 'bad-file-name' }); continue }
        if (!row.proposedHeader) { skipped.push({ file: row.file, code: 'not-proposable' }); continue }
        // one file the core will not take does not stop the others: its code goes into `skipped`
        try {
          apply(dir, row.file, {})
          written.push(row.file)
        } catch (err) {
          log(`browse: header not written onto ${row.file}: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
          skipped.push({ file: row.file, code: typeof err?.code === 'string' ? err.code : 'internal' })
        }
      }
      log(`browse: headers written onto ${written.length} files, ${skipped.length} skipped`)
      if (written.length) emit('library-changed', library.current())
      return { written, skipped }
    },
  }

  return { handlers }
}
