// Temporary folders of the scripts and tests: always under the OS temp folder, never anywhere else.
// Made with mkdirSync under a name of our own, not mkdtemp: a folder mkdtemp makes on Windows does not inherit the
// parent's permissions the way a sandboxed subprocess needs (a lesson of the earlier shell), and a plain mkdir does.
import { mkdirSync, realpathSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

/** Is `dir` strictly inside the OS temp folder? */
export function underTemp(dir) {
  const base = (() => { try { return realpathSync(tmpdir()) } catch { return resolve(tmpdir()) } })()
  const norm = p => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
  const rel = relative(norm(base), norm(dir))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** A fresh folder under the OS temp folder: <prefix><6 random hex>, made with mkdirSync (not mkdtemp). */
export function tempDir(prefix) {
  for (let tries = 0; tries < 20; tries++) {
    const dir = join(tmpdir(), `${prefix}${randomBytes(3).toString('hex')}`)
    try {
      mkdirSync(dir)
      return dir
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }
  throw new Error(`could not make a temporary folder under ${tmpdir()}`)
}
