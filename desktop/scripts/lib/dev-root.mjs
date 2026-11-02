// The development folders of these scripts (start.mjs, make-sample.mjs): under the OS temp folder, and marked as
// theirs by a marker file written before anything else. Only a marked folder is ever emptied or filled again; any
// other folder that exists and holds something is refused, untouched — whatever --root names.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { removeTree } from './remove-tree.mjs'
import { underTemp } from './temp.mjs'

export const MARKER = '.streams-desktop-dev.json'

export class RootRefused extends Error {
  constructor(message) {
    super(message)
    this.code = 'root_refused'
  }
}

/** Was `root` made by these scripts (it holds the marker)? */
export function hasMarker(root) {
  try { return JSON.parse(readFileSync(join(root, MARKER), 'utf8')).tool === 'streams-desktop' } catch { return false }
}

/**
 * Make `root` ours to fill: under the OS temp folder; if it exists and holds anything, it must carry the marker
 * (with `fresh`, it is then emptied, links first); the marker is written first.
 * @throws {RootRefused} not under the temp folder, or a folder these scripts did not make
 */
export function claimRoot(root, { fresh = false } = {}) {
  if (!underTemp(root)) throw new RootRefused(`refusing ${root}: development folders go under the OS temp folder`)
  if (existsSync(root)) {
    const entries = readdirSync(root)
    if (entries.length && !hasMarker(root)) {
      throw new RootRefused(`refusing ${root}: it exists and was not made by these scripts (no ${MARKER}); nothing in it was touched`)
    }
    if (fresh && entries.length) removeTree(root)
  }
  mkdirSync(root, { recursive: true })
  if (!hasMarker(root)) writeFileSync(join(root, MARKER), `${JSON.stringify({ tool: 'streams-desktop', made: new Date().toISOString() })}\n`)
}
