/**
 * Where a new library goes while settings.json has no libraryRoot (v2 package I's 新建库默认放在; docs/desktop.md §4.10).
 *
 *   const root = defaultLibraryRoot({ packaged: app.isPackaged, getPath: n => app.getPath(n), devRoot, appData, log })
 *   root()   → the folder, worked out the first time it is asked for, then the same answer
 *
 * Packaged: <Documents>\Streams. v2 package J2 (the installer test found it: the packaged app did not start where Windows
 * could not give the Documents folder — app.getPath('documents') threw at start, "Failed to get 'documents' path"): the
 * folder is worked out only when it is first needed, and when Electron cannot give a folder the next one is taken —
 * <home>\Streams, then <app data>\libraries — with one line in the log. Nothing here makes a folder.
 * A development run: STREAMS_DEV_LIBRARY_ROOT when given, else <app data>\libraries (it never falls back to the real
 * Documents folder); getPath is not asked.
 * @module desktop/main/library-root
 */

import { join } from 'node:path'

/**
 * @param {object} o
 * @param {boolean} o.packaged - app.isPackaged
 * @param {(name: string) => string} o.getPath - app.getPath
 * @param {string|null} [o.devRoot] - STREAMS_DEV_LIBRARY_ROOT (development only)
 * @param {string} o.appData - layout.appData (the last place to fall back to)
 * @param {(line: string) => void} [o.log]
 * @returns {() => string}
 */
export function defaultLibraryRoot({ packaged, getPath, devRoot = null, appData, log = () => {} }) {
  let found = null
  const work = () => {
    if (!packaged) return devRoot ?? join(appData, 'libraries')
    const tried = []
    for (const name of ['documents', 'home']) {
      try {
        const dir = getPath(name)
        if (typeof dir === 'string' && dir) {
          const root = join(dir, 'Streams')
          if (tried.length) log(`library: the default place for a new library is ${root} (${tried.join('; ')})`)
          return root
        }
        tried.push(`no ${name} folder`)
      } catch (error) {
        tried.push(`no ${name} folder: ${error?.message ?? error}`)
      }
    }
    const root = join(appData, 'libraries')
    log(`library: the default place for a new library is ${root} (${tried.join('; ')})`)
    return root
  }
  return () => {
    if (found === null) found = work()
    return found
  }
}
