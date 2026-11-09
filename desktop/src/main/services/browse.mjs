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

import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'

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
      return { counts: call('libraryCounts', dir), ...listed }
    },
    searchLibrary(q, filter) {
      const dir = library.require()
      return call('search', dir, q, { ...filterOf(filter, ['view', 'topics', 'days']), now })
    },
    readNote(id) {
      return call('readNote', known(id), id)
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
