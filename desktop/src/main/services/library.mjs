/**
 * The library the app has open (plan C3; docs/desktop.md §四 「库」): choosing a folder, making a library in it or
 * opening the one there, the recent list, the index, the folder in Explorer. The page never hands a path to the file
 * system: a folder comes from the system dialog (or the development hook), is remembered here, and `useChosenFolder`
 * acts on that memory; `openRecentLibrary` accepts only a path already in settings.recentLibraries.
 *
 * Pure Node apart from what is injected (`dialog`, `shell`), so the rules run in plain Node (test/services-library.test.mjs).
 *
 * Development and tests only (a packaged app ignores them; main.mjs reads the variables):
 *   STREAMS_DEV_LIBRARY          a library folder taken as opened at start (the setting is not read then)
 *   STREAMS_DEV_CHOOSE_FOLDER    an absolute path `chooseLibraryFolder` gives instead of opening the dialog
 * @module desktop/main/services/library
 */

import { existsSync, readdirSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import { BridgeError } from '../bridge-methods.mjs'
import { CONFIG_FILE, createLibrary, readConfig, rebuildIndex } from '../core.mjs'
import { readSettings, withRecent, writeSettings } from '../settings.mjs'

export const FOLDER_STATES = Object.freeze(['empty', 'library', 'other'])

/** What is in a chosen folder: nothing (or no folder yet) → empty; a streams.json → library; anything else → other. */
export function folderState(path) {
  if (!existsSync(path)) return 'empty'
  let names
  try { names = readdirSync(path) } catch { return 'other' }
  if (names.length === 0) return 'empty'
  return names.includes(CONFIG_FILE) ? 'library' : 'other'
}

/**
 * @param {object} o
 * @param {string} o.settingsFile - layout.settingsFile
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {boolean} [o.hidden] - a test run: nothing is opened outside the app
 * @param {{showOpenDialog: (options: object) => Promise<{canceled: boolean, filePaths: string[]}>}} o.dialog
 * @param {{showItemInFolder: (path: string) => void}} o.shell
 * @param {() => {resolved: string}} o.locale - the language a new library's default prompts are written in
 * @param {string|null} [o.devLibrary] - STREAMS_DEV_LIBRARY
 * @param {string|null} [o.devChooseFolder] - STREAMS_DEV_CHOOSE_FOLDER
 */
export function createLibraryService({ settingsFile, emit, log, hidden = false, dialog, shell, locale, devLibrary = null, devChooseFolder = null }) {
  const settings = () => readSettings(settingsFile)
  // the folder the last chooseLibraryFolder gave: the only path useChosenFolder acts on
  let chosen = null

  const dir = () => devLibrary ?? settings().libraryPath
  const current = () => {
    const d = dir()
    return d ? { path: d, name: basename(d) } : null
  }
  /** The open library's folder, or no_library. */
  const require = () => {
    const d = dir()
    if (!d) throw new BridgeError('no_library')
    return d
  }

  /** The folder becomes the open library: the setting, the recent list, the event. */
  const open = path => {
    writeSettings(settingsFile, { libraryPath: path, recentLibraries: withRecent(settings().recentLibraries, path) })
    try { rebuildIndex(path) } catch (err) { log(`library: index not rebuilt on open: ${String(err?.message ?? err)}`) }
    const lib = { path, name: basename(path) }
    log(`library: opened ${path}`)
    emit('library-changed', lib)
    emit('settings-changed', null)
    return lib
  }

  const openExisting = path => {
    const r = readConfig(path)
    if (!r.ok) {
      log(`library: cannot open ${path}: ${r.error.code}: ${r.error.message}`)
      throw new BridgeError('open_failed')
    }
    return open(path)
  }

  const handlers = {
    async chooseLibraryFolder() {
      let path
      if (devChooseFolder) {
        path = devChooseFolder
      } else {
        const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
        if (r.canceled || !Array.isArray(r.filePaths) || r.filePaths.length === 0) { chosen = null; return null }
        path = r.filePaths[0]
      }
      if (typeof path !== 'string' || !isAbsolute(path)) { chosen = null; return null }
      path = resolve(path)
      chosen = { path, name: basename(path), state: folderState(path) }
      log(`library: chose ${path} (${chosen.state})`)
      return { ...chosen }
    },
    useChosenFolder(name) {
      if (!chosen) throw new BridgeError('bad_arguments', 'no folder chosen')
      const { path, state } = chosen
      // the folder may have changed since it was chosen: judged again now
      const now = folderState(path)
      if (now === 'empty') {
        const libraryName = typeof name === 'string' && name.trim() !== '' ? name.trim() : basename(path)
        try {
          createLibrary(path, { name: libraryName, language: locale().resolved })
        } catch (err) {
          log(`library: cannot make a library in ${path}: ${String(err?.code ?? '')} ${String(err?.message ?? err)}`)
          throw new BridgeError('open_failed')
        }
        return open(path)
      }
      if (now === 'library') return openExisting(path)
      log(`library: ${path} is ${now} (was ${state}): not a library and not empty`)
      throw new BridgeError('open_failed')
    },
    openRecentLibrary(path) {
      if (!settings().recentLibraries.includes(path)) throw new BridgeError('bad_arguments', 'not a recent library')
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
    revealLibrary() {
      const d = require()
      if (hidden) { log(`not revealed in a test run: ${d}`); return null }
      shell.showItemInFolder(d)
      return null
    },
  }

  return { handlers, dir, current, require, chosen: () => (chosen ? { ...chosen } : null) }
}
