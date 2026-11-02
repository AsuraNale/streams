// A copy of desktop/ under the OS temp folder, for the deliberate-break checks (scripts/mutation-check.mjs): break the
// copy, never the original.
//   <M>/desktop                a copy of desktop/ (no node_modules, no .work); its node_modules holds links to the real packages
//   <M>/installer, <M>/wording   links (the pinned Electron; the wording scanner the tests import)
//   <M>/docs/desktop.md        a copy (the bridge and event tables the tests read)
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
  mkdirSync(join(root, 'docs'), { recursive: true })
  for (const doc of ['desktop.md', 'tokens.md']) {
    if (existsSync(join(REPO_DIR, 'docs', doc))) cpSync(join(REPO_DIR, 'docs', doc), join(root, 'docs', doc))
  }
  const desktop = join(root, 'desktop')
  const skip = new Set([join(DESKTOP_DIR, 'node_modules'), join(DESKTOP_DIR, '.work')])
  cpSync(DESKTOP_DIR, desktop, { recursive: true, filter: src => !skip.has(src) && ![...skip].some(s => src.startsWith(s + sep)) })
  const realModules = join(DESKTOP_DIR, 'node_modules')
  for (const name of ['preact', 'htm', 'playwright-core']) link(join(realModules, name), join(desktop, 'node_modules', name))
  return { root, desktop }
}
