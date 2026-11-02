// Deleting a temporary folder that may hold links: every link / junction is unlinked first, never followed,
// so no delete reaches through one. A folder Windows
// still holds (an Electron that is just exiting) is tried again for up to `waitMs`.
import { readdirSync, rmdirSync, rmSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

function removeLink(path) {
  try {
    unlinkSync(path)
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EISDIR') throw error
    rmdirSync(path) // a directory link on Windows: removes the link, not its target
  }
}

/** Unlink every link below `root` (as readdir reports them; junctions count as links on Windows). */
export function unlinkLinksUnder(root) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return
    throw error
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) removeLink(path)
    else if (entry.isDirectory()) unlinkLinksUnder(path)
  }
}

const IN_USE = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EMFILE', 'ENFILE'])
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export function removeTree(dir, { waitMs = 5000 } = {}) {
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      unlinkLinksUnder(dir)
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (error) {
      if (!IN_USE.has(error.code) || Date.now() >= deadline) throw error
      pause(100)
    }
  }
}

/** Every link below `root` (for checks that a folder holds none). */
export function linksUnder(root) {
  const found = []
  let entries
  try { entries = readdirSync(root, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) found.push(path)
    else if (entry.isDirectory()) found.push(...linksUnder(path))
  }
  return found
}
