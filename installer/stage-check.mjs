/**
 * Checks on a stage (the folder the installer installs, docs/installer.md §三) that installer/build-installer.mjs runs
 * before ISCC, kept here so a test can run the very same functions on a copy (installer/test/stage-check.test.mjs):
 *
 *   linksIn(stage)                  every link or junction below the stage (the install must hold real folders)
 *   relativeImportProblems(stage)   every relative `import` / `from` / `import()` in our own code — resources\app\src and
 *                                   resources\core\src — that names a file the stage does not have (the component
 *                                   gallery's files, loaded only in development, excepted). This is what catches "the core
 *                                   was not packed": desktop/src/main/core.mjs imports ../../../core/src/index.mjs, which in
 *                                   an install is resources\core\src\index.mjs
 *   developmentLeftovers(stage)     tests, fixtures, samples and development scripts below resources\app and resources\core
 * @module installer/stage-check
 */

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** Our own code in a stage: the folders whose relative imports must all resolve inside it. */
export const OWN_CODE = Object.freeze([['resources', 'app', 'src'], ['resources', 'core', 'src']])

/** Every entry below `dir`: { path, link, dir, size }; links are reported, never followed. */
export function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const st = lstatSync(path)
    if (st.isSymbolicLink()) yield { path, link: true, dir: false }
    else if (st.isDirectory()) { yield { path, link: false, dir: true }; yield* walk(path) }
    else yield { path, link: false, dir: false, size: st.size }
  }
}

/** Links (symbolic links, junctions) below `stage`, relative to it. */
export function linksIn(stage) {
  const out = []
  for (const e of walk(stage)) if (e.link) out.push(relative(stage, e.path))
  return out
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/g

/**
 * @param {string} stage
 * @param {object} [o]
 * @param {string[]} [o.devOnly] - the component gallery's files, relative to resources/app/src/renderer (protocol.mjs DEV_ONLY)
 * @returns {{imports: number, files: number, unresolved: string[], missingRoots: string[]}}
 */
export function relativeImportProblems(stage, { devOnly = [] } = {}) {
  let imports = 0
  let files = 0
  const unresolved = []
  const missingRoots = []
  const gallery = devOnly.map(d => resolve(stage, 'resources', 'app', 'src', 'renderer', ...d.split('/')))
  for (const parts of OWN_CODE) {
    const root = join(stage, ...parts)
    if (!existsSync(root)) { missingRoots.push(parts.join('/')); continue }
    for (const e of walk(root)) {
      if (e.dir || e.link || !/\.(mjs|js|cjs)$/.test(e.path)) continue
      files += 1
      for (const m of readFileSync(e.path, 'utf8').matchAll(IMPORT_RE)) {
        imports += 1
        const target = resolve(dirname(e.path), m[2])
        if (!existsSync(target) && !gallery.includes(target)) unresolved.push(`${relative(stage, e.path).split(sep).join('/')} → ${m[2]}`)
      }
    }
  }
  return { imports, files, unresolved, missingRoots }
}

const LEFTOVER_DIR = /^(test|tests|__tests__|fixtures|samples?|examples?|scripts|mock|mocks)$/i
const LEFTOVER_FILE = /(\.test\.(mjs|js|cjs)$|\.spec\.(mjs|js|cjs)$)/i

/** Tests, fixtures, samples, development scripts below our own folders of the stage (relative paths); [] = none. */
export function developmentLeftovers(stage) {
  const out = []
  for (const top of [['resources', 'app'], ['resources', 'core']]) {
    const root = join(stage, ...top)
    if (!existsSync(root)) continue
    for (const e of walk(root)) {
      const rel = relative(stage, e.path).split(sep).join('/')
      // the npm packages keep their own layout (preact's and htm's files are theirs)
      if (rel.includes('/node_modules/')) continue
      const name = rel.split('/').pop()
      if ((e.dir && LEFTOVER_DIR.test(name)) || (!e.dir && LEFTOVER_FILE.test(name))) out.push(rel)
    }
  }
  return out
}
