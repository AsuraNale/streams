/**
 * 新建库's form in the main process (redesign R4a; docs/desktop.md §4.16; design P04, F56, F57, N01, O15): the defaults the page
 * starts from, the folder 创建 would use, the estimate of the first run, and the library made from the form — the same core
 * function a confirmed create_library card runs (core fillNewLibrary), so the two ways give the same library (O15).
 *
 *   getNewLibraryDefaults()            → { strictness, levels, schedule, cap, root, packs }   the form opened: 标准, the app's
 *                                        schedule (settings.json's; what a card without one gets too), the pipeline's cap, where
 *                                        a new library goes (settings.json libraryRoot, else the default place), the preset
 *                                        packs (core listStarterPacks). A folder chosen before (chooseLibraryFolder) is forgotten.
 *   newLibraryFolder(name)             → { path, state, mdCount?, chosen }   the folder 创建 would use: the one chosen with 「更改…」
 *                                        (chooseLibraryFolder), else <root>\<name as a folder name>; its state as
 *                                        services/library.mjs folderState says it (a folder that is not there is empty)
 *   estimateNewLibrary(items, cap)     → { expectedCalls: [lo, hi], items, cap }   core estimateFirstRound
 *   createNewLibrary(form)             → { library, made: 'created' | 'imported' | 'opened', queued }
 *     form = { name, brief, strictness, topics: [name], sources: [source], packId, schedule: { enabled, time }, cap, run }.
 *     Judged first (core checkNewLibrary: an empty brief, a source the core would not store — bad_arguments, nothing made).
 *     The folder: empty → core createLibrary; .md files and no streams.json → core importFolder (nothing of the user's moved or
 *     changed, F57); a library there already → it is opened as it is (its streams.json untouched, nothing of the form written,
 *     no run); anything else → open_failed, nothing made. Then core fillNewLibrary with the level's two thresholds, the
 *     schedule and the cap (only a cap other than the pipeline's default is written) — each field the user's own in
 *     changes.jsonl (byYou) — the setup records (library · connection from 首次打开 · pack · sources · trial · schedule), the
 *     registration (it becomes the current library) and, for 「创建并运行」 only, one round in the app's one queue
 *     (services/schedule.mjs queueRound: why 'first', 创建库后的首次运行). 「仅创建」 queues nothing.
 * Pure Node apart from what is injected (test/services-new-library.test.mjs).
 * @module desktop/main/services/new-library
 */

import { basename, join } from 'node:path'
import { BridgeError, bridgeErrorOf } from '../bridge-methods.mjs'
import {
  DEFAULTS, DEFAULT_STRICTNESS, STRICTNESS, STRICTNESS_LEVELS, checkNewLibrary, countFirstLevelMd, createLibrary, estimateFirstRound,
  fillNewLibrary, importFolder, libraryFolderName, listStarterPacks, newLibrarySettings, packView, recordSetupStep, scheduleOf, starterPack,
} from '../core.mjs'
import { readSettings } from '../settings.mjs'
import { byYou } from './changes.mjs'
import { folderState } from './library.mjs'

const NAME_MAX = 100
const CAP_MAX = 10_000
const SOURCE_KEYS = ['name', 'kind', 'url', 'query', 'topic', 'min_points', 'max_results']
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * @param {object} o
 * @param {object} o.library - services/library.mjs (chosen, clearChosen, adopt, find, inheritConnection)
 * @param {() => ({queueRound: Function}|null)} o.scheduler - services/schedule.mjs, once it is made
 * @param {string} o.settingsFile
 * @param {() => string} o.libraryRoot - settings.json's libraryRoot, else the default place (main.mjs)
 * @param {() => {resolved: string}} o.locale
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 */
export function createNewLibraryService({ library, scheduler = () => null, settingsFile, libraryRoot, locale, log, now = () => new Date() }) {
  const appSchedule = () => scheduleOf(readSettings(settingsFile).schedule)
  const lang = () => locale().resolved

  /** The folder 创建 would use for `name`. */
  const folderFor = name => {
    const chosen = library.chosen()
    const path = chosen ? chosen.path : join(libraryRoot(), libraryFolderName(name))
    const state = folderState(path)
    const out = { path, state, chosen: Boolean(chosen) }
    if (state === 'importable') { try { out.mdCount = countFirstLevelMd(path) } catch { out.mdCount = 0 } }
    return out
  }

  /** The form as the core takes it; bad_arguments for anything that does not fit. */
  const formOf = form => {
    if (!isObject(form)) throw new BridgeError('bad_arguments', 'the form is an object')
    const name = typeof form.name === 'string' ? form.name.trim() : ''
    if (name === '' || name.length > NAME_MAX) throw new BridgeError('bad_arguments', 'a library needs a name (1–100 characters)')
    if (!STRICTNESS_LEVELS.includes(form.strictness)) throw new BridgeError('bad_arguments', 'strictness is loose · standard · strict')
    if (!Array.isArray(form.topics) || !form.topics.every(t => typeof t === 'string')) throw new BridgeError('bad_arguments', 'topics are names')
    if (!Array.isArray(form.sources) || !form.sources.every(isObject)) throw new BridgeError('bad_arguments', 'sources are objects')
    if (form.packId !== null && form.packId !== undefined && typeof form.packId !== 'string') throw new BridgeError('bad_arguments', 'packId')
    if (!isObject(form.schedule) || typeof form.schedule.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.schedule.time ?? '')) throw new BridgeError('bad_arguments', 'schedule')
    if (!Number.isInteger(form.cap) || form.cap < 1 || form.cap > CAP_MAX) throw new BridgeError('bad_arguments', 'cap')
    if (typeof form.run !== 'boolean') throw new BridgeError('bad_arguments', 'run')
    const sources = form.sources.map(s => Object.fromEntries(SOURCE_KEYS.filter(k => s[k] !== undefined).map(k => [k, s[k]])))
    const topics = form.topics.map(n => ({ name: n.trim(), keywords: [] }))
    let stored
    try { stored = checkNewLibrary({ brief: form.brief, topics, sources }) } catch (err) { throw bridgeErrorOf(err) }
    return { name, brief: String(form.brief).trim(), strictness: form.strictness, topics, sources: stored, packId: form.packId ?? null, schedule: { enabled: form.schedule.enabled, time: form.schedule.time }, cap: form.cap, run: form.run }
  }

  /** The setup records of a library 新建库 made (a record that cannot be written is said in the log; the library stands). */
  const recordSetup = (dir, f, { chosen, state }) => {
    const pack = f.packId ? packView(f.packId, lang()) : null
    const packNames = new Set((pack?.sources ?? []).map(s => s.name))
    const names = new Set(f.sources.map(s => s.name))
    const removed = [...packNames].filter(n => !names.has(n)).length
    const added = [...names].filter(n => !packNames.has(n)).length
    const def = appSchedule()
    const records = [
      ['library', chosen ? { by: 'chose', detail: state } : { by: 'default', detail: state }],
      ['pack', pack ? { by: 'chose', detail: f.packId } : { by: 'skipped' }],
      ['sources', removed === 0 && added === 0 ? { by: 'default' } : { by: 'wrote', detail: { removed, added } }],
      ['trial', f.run ? { by: 'chose' } : { by: 'skipped' }],
      ['schedule', f.schedule.enabled === def.enabled && f.schedule.time === def.time ? { by: 'default', detail: f.schedule } : { by: 'wrote', detail: f.schedule }],
    ]
    for (const [step, entry] of records) {
      try { recordSetupStep(dir, step, entry, { now }) } catch (err) { log(`new library: setup ${step} not recorded: ${String(err?.message ?? err)}`) }
    }
  }

  const handlers = {
    getNewLibraryDefaults() {
      library.clearChosen()
      const levels = Object.fromEntries(STRICTNESS_LEVELS.map(l => [l, { ...STRICTNESS[l] }]))
      // each pack's sources as the core keeps them (packView leaves out min_points), their topic by its name in this language
      const packs = listStarterPacks(lang()).map(p => ({ id: p.id, name: p.name, topics: [...p.topics], sources: starterPack(p.id).sources.map((s, i) => ({ ...s, topic: p.sources[i].topic })) }))
      return { strictness: DEFAULT_STRICTNESS, levels, schedule: appSchedule(), cap: DEFAULTS.cap, root: libraryRoot(), packs }
    },
    newLibraryFolder(name) {
      return folderFor(name)
    },
    estimateNewLibrary(items, cap) {
      return estimateFirstRound({ items, cap })
    },
    createNewLibrary(form) {
      const f = formOf(form)
      const where = folderFor(f.name)
      const { path, state } = where
      if (state === 'other') { log(`new library: ${path} holds other things: nothing made`); throw new BridgeError('open_failed') }
      if (state === 'library') {
        // a library there already: opened as it is — nothing of the form is written, no run (its streams.json untouched)
        const lib = library.adopt(path)
        library.clearChosen()
        log(`new library: ${path} already holds a library: opened as it is`)
        return { library: lib, made: 'opened', queued: null }
      }
      const language = lang()
      try {
        if (state === 'empty') createLibrary(path, { name: f.name, language })
        else {
          const r = importFolder(path, { name: f.name, language })
          log(`new library: imported ${path}: ${r.notes} conforming, ${r.pending} to tidy (the user's files not moved or changed)`)
        }
      } catch (err) {
        log(`new library: cannot make a library in ${path}: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
        throw new BridgeError('open_failed')
      }
      const settings = newLibrarySettings({ thresholds: STRICTNESS[f.strictness], schedule: f.schedule, cap: f.cap === DEFAULTS.cap ? null : f.cap })
      try {
        byYou(path, ['brief', 'topics', 'sources', 'thresholds', 'schedule', 'cap'], () => fillNewLibrary(path, { brief: f.brief, topics: f.topics, sources: f.sources, ...settings }), { log, now })
      } catch (err) {
        // judged before anything was made (formOf): a failure here is the disk's; the folder keeps what was made, said in the log
        log(`new library: ${path}: settings not all written: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
        throw bridgeErrorOf(err)
      }
      recordSetup(path, f, where)
      library.inheritConnection(path)
      const lib = library.adopt(path, { name: f.name })
      library.clearChosen()
      log(`new library: ${lib.libraryId} ${path} (${state === 'empty' ? 'created' : 'imported'}, ${f.strictness}, ${f.sources.length} sources${f.run ? ', its first run asked for' : ', not run'})`)
      let queued = null
      if (f.run) {
        const entry = library.find(lib.libraryId)
        const s = scheduler()
        if (entry && s) queued = s.queueRound(entry, `new library ${basename(path)}`)
        else log(`new library: ${lib.libraryId}: no queue to put its first run in`)
      }
      return { library: lib, made: state === 'empty' ? 'created' : 'imported', queued }
    },
  }
  return { handlers }
}
