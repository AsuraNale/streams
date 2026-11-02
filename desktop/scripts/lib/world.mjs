// Development and test worlds: the folders one run of the app gets, under a root in the OS temp folder. The shell has no
// example data yet (plan 5.2: fixtures come with the library and the pipeline), so a world is an empty one: the app-data
// folder, the local-data folder, and an empty library folder for `--library`.
//   makeWorld({ root })     the folders under `root` (which must not hold a world yet); writes world.json
//   worldDirs(root)         where they are
//   worldOf(root)           is `root` a finished world?
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const WORLD_FILE = 'world.json'

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
 * @returns {Promise<{root: string, appData: string, localData: string, library: string, kind: string}>}
 */
export async function makeWorld({ root }) {
  const dirs = worldDirs(root)
  for (const d of [dirs.appData, dirs.localData, dirs.library]) mkdirSync(d, { recursive: true })
  writeFileSync(join(root, WORLD_FILE), `${JSON.stringify({ kind: 'empty' })}\n`)
  return { ...dirs, kind: 'empty' }
}
