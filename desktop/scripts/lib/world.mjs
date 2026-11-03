// Development and test worlds: the folders one run of the app gets, under a root in the OS temp folder. A world is the
// app-data folder, the local-data folder, and a library folder:
//   kind 'empty'    the library folder holds an empty library the core made (createLibrary): the shell's own tests open it
//                   and start on 今日; a test of 首次设置 passes STREAMS_DEV_LIBRARY='' to start without one
//   kind 'seeded'   the library holds what one real round of the core left (test/support/seed.mjs): topics, two dead sources,
//                   four cards in 待看, one kept, one dismissed, one card 17 days old — for the screen tests and the screenshots
//   makeWorld({ root, kind })   the folders under `root` (which must not hold a world yet); writes world.json
//   worldDirs(root)             where they are
//   worldOf(root)               is `root` a finished world?
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from './paths.mjs'

const CORE = pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href

const WORLD_FILE = 'world.json'
export const WORLD_KINDS = Object.freeze(['empty', 'seeded'])

/** The folders of a world under `root`. */
export function worldDirs(root) {
  return { root, appData: join(root, 'world', 'app-data'), localData: join(root, 'world', 'local-data'), library: join(root, 'world', 'library') }
}

/** Is `root` a finished world? */
export function worldOf(root) {
  try { return JSON.parse(readFileSync(join(root, WORLD_FILE), 'utf8')) } catch { return null }
}

/**
 * One app world under `root`.
 * @param {object} o
 * @param {string} o.root
 * @param {'empty'|'seeded'} [o.kind]
 * @returns {Promise<{root: string, appData: string, localData: string, library: string, kind: string, seed?: object}>}
 */
export async function makeWorld({ root, kind = 'empty' }) {
  if (!WORLD_KINDS.includes(kind)) throw new Error(`makeWorld: kind must be one of ${WORLD_KINDS.join(' | ')}`)
  const dirs = worldDirs(root)
  for (const d of [dirs.appData, dirs.localData, dirs.library]) mkdirSync(d, { recursive: true })
  let seed
  if (kind === 'empty') {
    const { createLibrary } = await import(CORE)
    createLibrary(dirs.library, { name: basename(dirs.library) })
  }
  if (kind === 'seeded') {
    const { seedLibrary } = await import('../../test/support/seed.mjs')
    seed = await seedLibrary(dirs.library)
  }
  writeFileSync(join(root, WORLD_FILE), `${JSON.stringify({ kind })}\n`)
  return { ...dirs, kind, ...(seed ? { seed } : {}) }
}
