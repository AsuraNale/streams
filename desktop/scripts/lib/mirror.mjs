// A copy of desktop/ under the OS temp folder, for the deliberate-break checks (scripts/mutation-check.mjs): break the
// copy, never the original.
//   <M>/desktop                a copy of desktop/ (no node_modules, no .work); its node_modules holds links to the real packages
//   <M>/installer, <M>/wording   links (the pinned Electron; the wording scanner the tests import)
//   <M>/core                   a link (the main process and the tests import the core from the repository: desktop/src/main/core.mjs)
//   <M>/docs/desktop.md        a copy (the bridge and event tables the tests read)
//   <M>/docs/design/redesign/source   a link (redesign R1: the design's template, which test/theme.test.mjs compares with)
//   <M>/docs/design/logo/source       a link (logo, 2026-11-12: the final 五流 files test/icon.test.mjs and ui-brand.test.mjs compare with)
//   <M>/docs/design/fonts             a link (redesign R6a: Noto Serif SC's source record, test/r6a.test.mjs)
//   <M>/docs/design/redesign/施工计划.md   a copy (redesign R6a: the sentences of the standards, test/r6a.test.mjs)
//   <M>/tests/acceptance              a copy (redesign R6a: V6 / V8 / V9 / V10 run on the copy of desktop/; standards.mjs can be edited)
//   <M>/LICENSE                       a copy (redesign R6a: the license page's data reads the repository's LICENSE in development —
//                                     test/r6a.test.mjs, test/ui-licenses.test.mjs)
// A mirror is not a git repository: scripts/mutation-check.mjs gives the tests STREAMS_MIRROR_OF, the repository it mirrors, for
// the one check that reads an earlier commit (test/r6a.test.mjs: standards.mjs before R6a).
// Remove it with removeTree (links first).
import { cpSync, existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from './paths.mjs'

const link = (target, path) => { mkdirSync(dirname(path), { recursive: true }); symlinkSync(target, path, 'junction') }

/**
 * @param {object} o
 * @param {string} o.root - an empty folder under the OS temp folder
 * @returns {Promise<{root: string, desktop: string}>}
 */
export async function makeMirror({ root }) {
  mkdirSync(root, { recursive: true })
  link(join(REPO_DIR, 'installer'), join(root, 'installer'))
  link(join(REPO_DIR, 'wording'), join(root, 'wording'))
  link(join(REPO_DIR, 'core'), join(root, 'core'))
  mkdirSync(join(root, 'docs'), { recursive: true })
  link(join(REPO_DIR, 'docs', 'design', 'redesign', 'source'), join(root, 'docs', 'design', 'redesign', 'source'))
  link(join(REPO_DIR, 'docs', 'design', 'logo', 'source'), join(root, 'docs', 'design', 'logo', 'source'))
  for (const doc of ['desktop.md', 'tokens.md']) {
    if (existsSync(join(REPO_DIR, 'docs', doc))) cpSync(join(REPO_DIR, 'docs', doc), join(root, 'docs', doc))
  }
  // redesign R6a: the font's source record (a link), the plan with the four sentences the maintainer saw (a copy), and the acceptance tests
  // (a copy: tests/acceptance/vNN-*.test.mjs start the copy of desktop/ beside them and read its text tables, so a mutant of a
  // dictionary is seen by them; a mutant may also edit the copy of standards.mjs — '../tests/acceptance/…' from desktop/)
  link(join(REPO_DIR, 'docs', 'design', 'fonts'), join(root, 'docs', 'design', 'fonts'))
  cpSync(join(REPO_DIR, 'docs', 'design', 'redesign', '施工计划.md'), join(root, 'docs', 'design', 'redesign', '施工计划.md'))
  cpSync(join(REPO_DIR, 'tests', 'acceptance'), join(root, 'tests', 'acceptance'), { recursive: true })
  cpSync(join(REPO_DIR, 'LICENSE'), join(root, 'LICENSE'))
  const desktop = join(root, 'desktop')
  const skip = new Set([join(DESKTOP_DIR, 'node_modules'), join(DESKTOP_DIR, '.work')])
  cpSync(DESKTOP_DIR, desktop, { recursive: true, filter: src => !skip.has(src) && ![...skip].some(s => src.startsWith(s + sep)) })
  const realModules = join(DESKTOP_DIR, 'node_modules')
  for (const name of ['preact', 'htm', 'playwright-core', '@mozilla/readability', 'unpdf']) link(join(realModules, name), join(desktop, 'node_modules', name))
  return { root, desktop }
}
