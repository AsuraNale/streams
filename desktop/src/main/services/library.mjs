/**
 * The libraries the app knows and the current one (plan C3; v2 package A; docs/desktop.md §四 「库」, §4.4): the registry
 * (core registry, <appData>/libraries.json), choosing a folder, making a library in it or opening the one there, the index,
 * the folder in Explorer. The page never hands a path to the file system: a folder comes from the system dialog (or the
 * development hook), is remembered here, and `useChosenFolder` / `addLibrary` act on that memory; `openRecentLibrary`
 * accepts only a registered folder. Every method of the bridge that works on 「the library」 works on the current one
 * (`dir()`); the cross-library ones name a library by its registry id (an unknown id: bad_arguments).
 *
 * The current library is the registry's `active`. Opening, making or importing a folder registers it (once) and makes it
 * the current one; removing a registration only drops it from the list — nothing in the folder is touched. The first
 * start of v2 finds no libraries.json and builds it from v1.0's settings.json (`libraryPath` first and current, then
 * `recentLibraries`; a folder not there is not registered); after that those two settings are read, never written.
 *
 * Pure Node apart from what is injected (`dialog`, `shell`), so the rules run in plain Node (test/services-library.test.mjs,
 * test/services-registry.test.mjs).
 *
 * Development and tests only (a packaged app ignores them; main.mjs reads the variables):
 *   STREAMS_DEV_LIBRARY          a library folder taken as the current one at start; not registered when it is not (its
 *                                id is then DEV_LIBRARY_ID, and nothing about it is written to the registry). Opening or
 *                                switching to another library ends it.
 *   STREAMS_DEV_CHOOSE_FOLDER    an absolute path `chooseLibraryFolder` gives instead of opening the dialog
 *
 * A chosen folder that holds .md files but no streams.json is `importable`: `useChosenFolder` makes it a library with the
 * core's importFolder (streams.json with notesDir ".", _pipeline/, the index beside the files; no file of the user's is
 * moved, renamed or changed) and opens it.
 *
 * 首次设置 records who decided each of its steps in the current library's streams.json (`recordSetupStep`, the core's;
 * plan A1), and the settings page reads it back (`getSetup`): a library made before, or imported, has none ({}).
 * v2 package I: 首次打开 walks its connection step while the app knows no library — `recordSetupStep('connection', …)` with
 * no current library writes settings.json's `setupConnection` ({ by, at, detail? }; any other step: no_library). A library
 * 新建库 makes (an empty folder: createLibrary; a folder of .md files: importFolder) gets that record as its
 * setup.connection, its `at` kept, when it has none yet.
 *
 * 新建库默认放在 (v2 package I; settings.json `libraryRoot`, package B's): getLibraryRoot → { path, isDefault } (no setting:
 * the app's default place, `defaultLibraryRoot`); chooseLibraryRoot = the system's folder dialog (STREAMS_DEV_CHOOSE_FOLDER in
 * development) then the same checks as setLibraryRoot(path | null): an absolute path, not the app-data folder or inside it
 * (bad_arguments, nothing written); null = back to the default. chooseLibraryFolder's dialog opens in that folder when it is there.
 * @module desktop/main/services/library
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { BridgeError, bridgeErrorOf } from '../bridge-methods.mjs'
import {
  CONFIG_FILE, NO_OUTPUT_ROUNDS, REGISTRY_FILE, countFirstLevelMd, createLibrary, defaultIcon, homeNumbers, importFolder, libraryAt,
  SETUP_BY, libraryOf, migrateRegistry, readBrief, readConfig, readRegistry, readSetup, rebuildIndex, recordSetupStep, usageTotal, withActive, withLibrary,
  withMeta, withoutLibrary, writeRegistry,
} from '../core.mjs'
import { readSettings, writeSettings } from '../settings.mjs'
import { isInside } from '../layout.mjs'

export const FOLDER_STATES = Object.freeze(['empty', 'library', 'importable', 'other'])
// the id the development library goes by while it is not registered (never a registry id: those are 8 characters)
export const DEV_LIBRARY_ID = 'dev'
// getLibrariesOverview's `problem`, at most one per library, in this order
export const LIBRARY_PROBLEMS = Object.freeze(['missing', 'sources', 'no-output'])

/**
 * What is in a chosen folder: nothing (or no folder yet) → empty; a streams.json → library; no streams.json but .md files
 * on its first level → importable (core importFolder, docs/desktop.md §4.3); anything else → other.
 */
export function folderState(path) {
  if (!existsSync(path)) return 'empty'
  let names
  try { names = readdirSync(path) } catch { return 'other' }
  if (names.length === 0) return 'empty'
  if (names.includes(CONFIG_FILE)) return 'library'
  return mdCount(path) > 0 ? 'importable' : 'other'
}

/** The .md files on a folder's first level (0 when it cannot be read). */
function mdCount(path) {
  try { return countFirstLevelMd(path) } catch { return 0 }
}

/** Is the folder there and its streams.json readable? */
function usable(path) {
  try { return existsSync(path) && readConfig(path).ok } catch { return false }
}

/**
 * @param {object} o
 * @param {string} o.settingsFile - layout.settingsFile (v1.0's libraryPath / recentLibraries: read once, for the migration)
 * @param {string} [o.registryFile] - layout.librariesFile; default libraries.json beside the settings file
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: nothing is opened outside the app
 * @param {{showOpenDialog: (options: object) => Promise<{canceled: boolean, filePaths: string[]}>}} o.dialog
 * @param {{showItemInFolder: (path: string) => void}} o.shell
 * @param {() => {resolved: string}} o.locale - the language a new library's default prompts are written in
 * @param {() => Date} [o.now]
 * @param {string|null} [o.devLibrary] - STREAMS_DEV_LIBRARY
 * @param {string|null} [o.devChooseFolder] - STREAMS_DEV_CHOOSE_FOLDER
 * @param {string|null} [o.agentUsageFile] - the main agent's usage.jsonl (v2 package C: <appData>/agent/usage.jsonl), counted in
 *   getUsageTotal on its own line (`agent`) and in the total
 * @param {string|null} [o.defaultLibraryRoot] - v2 package I: where a new library goes while settings.json has no libraryRoot
 *   (main.mjs: Documents\Streams packaged; a development run: STREAMS_DEV_LIBRARY_ROOT or a folder in its app data)
 * @param {string[]} [o.protectedDirs] - v2 package I: folders a libraryRoot may not be in (layout.protectedDirs: the app data);
 *   default: the settings file's folder
 */
export function createLibraryService({ settingsFile, registryFile = join(dirname(settingsFile), REGISTRY_FILE), emit, log, hidden = false, dialog, shell, locale, now = () => new Date(), devLibrary = null, devChooseFolder = null, agentUsageFile = null, defaultLibraryRoot = null, protectedDirs = [dirname(settingsFile)] }) {
  // the folder the last chooseLibraryFolder gave: the only path useChosenFolder and addLibrary act on
  let chosen = null

  // the first start of v2: no registry yet → from v1.0's settings.json (read only; those fields are never written again)
  if (!existsSync(registryFile)) {
    const s = readSettings(settingsFile)
    const first = migrateRegistry({ libraryPath: s.libraryPath, recentLibraries: s.recentLibraries }, { now, log })
    writeRegistry(registryFile, first)
    log(`library: the registry made from settings.json: ${first.libraries.length} libraries, current ${first.active ?? 'none'}`)
  }

  const registry = () => readRegistry(registryFile, { log })
  const save = reg => writeRegistry(registryFile, reg)

  // the development library is the current one from the start until another one is opened or switched to: `devId` when
  // its folder is registered, else `temp`, a row of its own that is never written ({ id: DEV_LIBRARY_ID, …, temporary: true })
  let devId = null
  let temp = null
  if (devLibrary) {
    const there = libraryAt(registry(), devLibrary)
    if (there) devId = there.id
    else temp = { id: DEV_LIBRARY_ID, path: devLibrary, name: basename(devLibrary), icon: defaultIcon(basename(devLibrary)), color: 'river', addedAt: null, temporary: true }
  }
  const endDev = () => { devId = null; temp = null }

  /** The current library's row: the development one while it lasts, else the registry's active one; null = none. */
  const active = () => {
    if (temp) return temp
    const reg = registry()
    const id = devId ?? reg.active
    return id ? libraryOf(reg, id) : null
  }
  const dir = () => active()?.path ?? null
  /** The current library as the page sees it (getAppState().library, the payload of library-changed). */
  const current = () => {
    const a = active()
    return a ? { libraryId: a.id, path: a.path, name: a.name } : null
  }
  /** The current library's folder, or no_library. */
  const require = () => {
    const d = dir()
    if (!d) throw new BridgeError('no_library')
    return d
  }

  /** Every library the app knows: the registered ones in their order, the development one first while it is not. */
  const entries = () => {
    const rows = registry().libraries.map(l => ({ ...l, temporary: false }))
    return temp ? [temp, ...rows] : rows
  }
  /** One library by id (the development one too while it lasts), or bad_arguments. */
  const entryOf = id => {
    const e = entries().find(l => l.id === id)
    if (!e) throw new BridgeError('bad_arguments', `no library ${String(id)}`)
    return e
  }

  // ---- 新建库默认放在 (v2 package I) ----
  /** { path, isDefault }: settings.json's libraryRoot, else the default place. */
  const rootView = () => {
    const set = readSettings(settingsFile).libraryRoot
    return set ? { path: set, isDefault: false } : { path: defaultLibraryRoot, isDefault: true }
  }
  /** libraryRoot = `path` (an absolute path outside the protected folders) or null (the default); else bad_arguments. */
  const setRoot = path => {
    if (path !== null) {
      if (typeof path !== 'string' || path.trim() === '' || !isAbsolute(path)) throw new BridgeError('bad_arguments', 'libraryRoot must be an absolute path')
      path = resolve(path)
      if (protectedDirs.some(d => isInside(path, d))) throw new BridgeError('bad_arguments', 'libraryRoot may not be inside the app data folder')
    }
    writeSettings(settingsFile, { libraryRoot: path })
    log(`library: new libraries go to ${path ?? `the default place (${defaultLibraryRoot})`}`)
    emit('settings-changed', null)
    return rootView()
  }
  /** The folder a dialog opens in: the libraryRoot when it is a folder that is there, else the system's choice. */
  const dialogStart = () => {
    const p = rootView().path
    try { return p && statSync(p).isDirectory() ? { defaultPath: p } : {} } catch { return {} }
  }

  /**
   * 首次打开's connection record (settings.json setupConnection) as `path`'s setup.connection, its time kept — only when the
   * library has no connection record yet. A failure is logged, not thrown: the library is made either way.
   */
  const inheritConnection = path => {
    const c = readSettings(settingsFile).setupConnection
    if (!c) return
    try {
      if (readSetup(path).connection) return
      recordSetupStep(path, 'connection', c.detail === undefined ? { by: c.by } : { by: c.by, detail: c.detail }, { now: () => new Date(c.at) })
      log(`library: ${path}: setup.connection from the first-run record (${c.by}${c.detail ? ` ${c.detail}` : ''}, ${c.at})`)
    } catch (err) { log(`library: ${path}: setup.connection not copied: ${String(err?.message ?? err)}`) }
  }

  /** The current library changed: the events v1.0 sent on an open, with the library's id. */
  const announce = why => {
    const lib = current()
    log(`library: current ${lib ? `${lib.libraryId} ${lib.path}` : 'none'} (${why})`)
    emit('library-changed', lib)
    emit('settings-changed', null)
    return lib
  }

  /** The folder becomes the current library: registered (once; `name` the registry's name, default the folder's), active, its index rebuilt, the events. */
  const open = (path, { name } = {}) => {
    const { registry: reg, entry, added } = withLibrary(registry(), path, { now, name })
    save(withActive(reg, entry.id))
    endDev()
    try { rebuildIndex(path) } catch (err) { log(`library: index not rebuilt on open: ${String(err?.message ?? err)}`) }
    log(`library: opened ${path}${added ? ` (registered as ${entry.id})` : ''}`)
    emit('libraries-changed', { libraryId: entry.id })
    return announce('opened')
  }

  const openExisting = path => {
    const r = readConfig(path)
    if (!r.ok) {
      log(`library: cannot open ${path}: ${r.error.code}: ${r.error.message}`)
      throw new BridgeError('open_failed')
    }
    return open(path)
  }

  /**
   * getLibrariesOverview's line for one library (the numbers from homeNumbers; a folder that cannot be read: missing).
   * v2 package F: also what the shelf's card and the library page's head show — the brief (null without one), the topics'
   * names, how many sources, how many rounds in a row put nothing into 待看.
   */
  const overviewOf = l => {
    const base = { id: l.id, name: l.name, icon: l.icon, color: l.color, inbox: 0, lastRoundAt: null, problem: null, brief: null, topics: [], sources: 0, noOutputStreak: 0 }
    if (!usable(l.path)) return { ...base, problem: 'missing' }
    let n
    try { n = homeNumbers(l.path, { now }) } catch (err) { log(`library: ${l.id}: numbers unreadable: ${String(err?.message ?? err)}`); return { ...base, problem: 'missing' } }
    const problem = n.sources?.level === 'blocked' || n.sources?.level === 'warning' ? 'sources' : n.noOutputStreak >= NO_OUTPUT_ROUNDS ? 'no-output' : null
    const cfg = readConfig(l.path).config ?? {}
    let brief = null
    try { brief = readBrief(l.path) } catch (err) { log(`library: ${l.id}: brief unreadable: ${String(err?.message ?? err)}`) }
    const topics = (Array.isArray(cfg.topics) ? cfg.topics : []).map(t => t?.name).filter(x => typeof x === 'string' && x !== '')
    const sources = Array.isArray(cfg.sources) ? cfg.sources.length : 0
    return { ...base, inbox: n.inbox, lastRoundAt: n.lastRound?.startedAt ?? null, problem, brief, topics, sources, noOutputStreak: n.noOutputStreak ?? 0 }
  }

  const handlers = {
    async chooseLibraryFolder() {
      let path
      if (devChooseFolder) {
        path = devChooseFolder
      } else {
        const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], ...dialogStart() })
        if (r.canceled || !Array.isArray(r.filePaths) || r.filePaths.length === 0) { chosen = null; return null }
        path = r.filePaths[0]
      }
      if (typeof path !== 'string' || !isAbsolute(path)) { chosen = null; return null }
      path = resolve(path)
      chosen = { path, name: basename(path), state: folderState(path) }
      // an importable folder: how many .md files the page can say it holds (「这个文件夹里有 n 个 .md」)
      if (chosen.state === 'importable') chosen.mdCount = mdCount(path)
      log(`library: chose ${path} (${chosen.state})`)
      return { ...chosen }
    },
    useChosenFolder(name) {
      if (!chosen) throw new BridgeError('bad_arguments', 'no folder chosen')
      const { path, state } = chosen
      // the folder may have changed since it was chosen: judged again now
      const state2 = folderState(path)
      if (state2 === 'empty') {
        const libraryName = typeof name === 'string' && name.trim() !== '' ? name.trim() : basename(path)
        try {
          createLibrary(path, { name: libraryName, language: locale().resolved })
        } catch (err) {
          log(`library: cannot make a library in ${path}: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
          throw new BridgeError('open_failed')
        }
        inheritConnection(path)
        return open(path)
      }
      if (state2 === 'library') return openExisting(path)
      if (state2 === 'importable') {
        const libraryName = typeof name === 'string' && name.trim() !== '' ? name.trim() : basename(path)
        try {
          const r = importFolder(path, { name: libraryName, language: locale().resolved })
          log(`library: imported ${path}: ${r.notes} conforming, ${r.pending} to tidy, ${r.skippedDirs.length} sub folders not read`)
        } catch (err) {
          log(`library: cannot import ${path}: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
          throw new BridgeError('open_failed')
        }
        inheritConnection(path)
        return open(path)
      }
      log(`library: ${path} is ${state2} (was ${state}): not a library and not empty`)
      throw new BridgeError('open_failed')
    },
    /** 设置「库 · 其他」: a folder that is registered (the exact path the registry holds). */
    openRecentLibrary(path) {
      if (!registry().libraries.some(l => l.path === path)) throw new BridgeError('bad_arguments', 'not a registered library')
      return openExisting(path)
    },
    rebuildIndex() {
      const d = require()
      let r
      try { r = rebuildIndex(d) } catch (err) {
        log(`library: rebuildIndex failed: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
        throw new BridgeError('open_failed')
      }
      emit('library-changed', current())
      return { count: r.entries.length, pending: r.pending.map(p => ({ file: p.file, codes: p.codes })) }
    },
    /**
     * 首次设置, at the end of each step: who decided it (core recordSetupStep: bad-setup → bad_arguments). v2 package I: no
     * library yet and the step is the connection (首次打开) → settings.json setupConnection, checked the way the core checks.
     */
    recordSetupStep(step, entry) {
      if (!dir() && step === 'connection') {
        const ok = entry !== null && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).every(k => k === 'by' || k === 'detail')
          && SETUP_BY.includes(entry.by) && (entry.detail === undefined || (typeof entry.detail === 'string' && entry.detail.length <= 100))
        if (!ok) throw new BridgeError('bad_arguments', 'a setup entry is { by, detail? }')
        const record = { by: entry.by, at: now().toISOString(), ...(entry.detail === undefined ? {} : { detail: entry.detail }) }
        writeSettings(settingsFile, { setupConnection: record })
        log(`library: first-run connection ${record.by}${record.detail ? ` ${record.detail}` : ''} (settings.json, no library yet)`)
        return { step, ...record }
      }
      const d = require()
      try { return recordSetupStep(d, step, entry) } catch (err) { throw bridgeErrorOf(err) }
    },
    /** 设置「库 · 首次设置」: the current library's record, {} when it has none. */
    getSetup() {
      const d = require()
      try { return readSetup(d) } catch (err) { throw bridgeErrorOf(err) }
    },
    revealLibrary() {
      const d = require()
      if (hidden) { log(`not revealed in a test run: ${d}`); return null }
      shell.showItemInFolder(d)
      return null
    },
    // ---- 新建库默认放在 (v2 package I) ----
    getLibraryRoot: () => rootView(),
    /** The system's folder dialog (or the development hook); null when nothing was chosen; else as setLibraryRoot. */
    async chooseLibraryRoot() {
      let path
      if (devChooseFolder) path = devChooseFolder
      else {
        const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], ...dialogStart() })
        if (r.canceled || !Array.isArray(r.filePaths) || r.filePaths.length === 0) return null
        path = r.filePaths[0]
      }
      return setRoot(path)
    },
    setLibraryRoot: path => setRoot(path),
    // ---- the registry (v2 package A) ----
    /** Every library the app knows, in order: the row, whether it is the current one, whether its folder can be read. */
    listLibraries() {
      const cur = active()?.id ?? null
      return entries().map(l => ({ id: l.id, path: l.path, name: l.name, icon: l.icon, color: l.color, addedAt: l.addedAt, temporary: l.temporary, active: l.id === cur, exists: usable(l.path) }))
    },
    /** `id` becomes the current library; its folder must still hold a library (else open_failed, nothing changes). */
    setActiveLibrary(id) {
      const e = entryOf(id)
      if (active()?.id === id) return current()
      if (!usable(e.path)) { log(`library: cannot switch to ${id}: ${e.path} is not a readable library`); throw new BridgeError('open_failed') }
      if (e.temporary) return current()
      save(withActive(registry(), id))
      endDev()
      emit('libraries-changed', { libraryId: id })
      return announce('switched')
    },
    /** 「添加已有库」: the folder the last chooseLibraryFolder gave (only that one), which must hold a library. */
    addLibrary(path) {
      if (!chosen || chosen.path !== path) throw new BridgeError('bad_arguments', 'not the folder just chosen')
      if (folderState(path) !== 'library') { log(`library: ${path} holds no library, not added`); throw new BridgeError('open_failed') }
      return openExisting(path)
    },
    /** Drop a registration: nothing in its folder is touched. The current one removed: the next one is current. */
    removeLibrary(id) {
      const e = entryOf(id)
      if (e.temporary) throw new BridgeError('bad_arguments', 'the development library is not registered')
      const wasCurrent = active()?.id === id
      save(withoutLibrary(registry(), id))
      if (devId === id) devId = null
      log(`library: ${id} (${e.path}) no longer registered; nothing in the folder was touched`)
      emit('libraries-changed', { libraryId: id })
      if (wasCurrent) announce(`removed ${id}`)
      return { removed: id, active: active()?.id ?? null }
    },
    /** The name, the icon, the colour of one library (core withMeta: a bad value → bad_arguments). */
    setLibraryMeta(id, meta) {
      const e = entryOf(id)
      if (e.temporary) throw new BridgeError('bad_arguments', 'the development library is not registered')
      let next
      try { next = save(withMeta(registry(), id, meta)) } catch (err) { throw bridgeErrorOf(err) }
      emit('libraries-changed', { libraryId: id })
      if (active()?.id === id) emit('library-changed', current())
      const row = libraryOf(next, id)
      return { id: row.id, name: row.name, icon: row.icon, color: row.color }
    },
    /** One line per library for the shelf and the sidebar (package F): its 待看 count, its last round, one problem or null. */
    getLibrariesOverview() {
      return entries().map(overviewOf)
    },
    /**
     * 设置「全部库本月用量合计」 (维护者 11-05): core usageTotal over every library this month (UTC, the app's clock); v2 package C:
     * the main agent's calls on their own line (`agent`, 「主 Agent」) and in the total.
     */
    getUsageTotal() {
      const list = entries()
      const t = usageTotal(list.map(l => l.path), { month: now().toISOString().slice(0, 7), ...(agentUsageFile ? { agentFile: agentUsageFile } : {}) })
      const callsOf = new Map(t.libraries.map(l => [l.dir, l.calls]))
      return {
        month: t.month, calls: t.calls, inputTokens: t.inputTokens, outputTokens: t.outputTokens, costUsd: t.costUsd, byKind: t.byKind,
        libraries: list.map(l => ({ id: l.id, name: l.name, calls: callsOf.get(l.path) ?? 0, missing: !callsOf.has(l.path) })),
        agent: t.agent ? { calls: t.agent.calls, inputTokens: t.agent.inputTokens, outputTokens: t.agent.outputTokens, costUsd: t.agent.costUsd } : { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      }
    },
  }

  return {
    handlers, dir, current, require, entries, entryOf, usable,
    chosen: () => (chosen ? { ...chosen } : null),
    /** The library with this id (bridge-free: the scheduler, later the agent), or null. */
    find: id => entries().find(l => l.id === id) ?? null,
    /**
     * A library a confirmed proposal card made (v2 package B, services/proposals.mjs): registered under `name` and made the
     * current one, the same way an open does. Bridge-free. → { libraryId, path, name }
     */
    adopt: (path, { name } = {}) => open(path, { name }),
    /**
     * The undo of adopt when a later step of the card failed: the registration dropped (nothing in the folder touched by
     * this), and `back` the current library again when it is still registered.
     */
    forget(id, back = null) {
      let reg = withoutLibrary(registry(), id)
      if (back && back !== id && libraryOf(reg, back)) reg = withActive(reg, back)
      save(reg)
      if (devId === id) devId = null
      log(`library: the registration of ${id} undone`)
      emit('libraries-changed', { libraryId: id })
      announce(`registration of ${id} undone`)
    },
  }
}
