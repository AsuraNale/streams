// Where the product is, for the acceptance tests, and the scratch folders they work in.
//
//   REPO_DIR       the repository root
//   CORE_DIR       core/ — or the folder named by STREAMS_CORE_DIR (a copy of core/ to run the same checks on,
//                  e.g. one with a guard taken out: the checks must then fail)
//   core           the core's public surface, src/index.mjs of CORE_DIR
//   caseDir(name)  an empty folder under os.tmpdir()/streams-acceptance/<name> (mkdirSync, not mkdtemp: a mkdtemp
//                  folder on Windows does not inherit a writable ACL)
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ACCEPTANCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const REPO_DIR = resolve(ACCEPTANCE_DIR, '..', '..')
export const CORE_DIR = process.env.STREAMS_CORE_DIR ? resolve(process.env.STREAMS_CORE_DIR) : join(REPO_DIR, 'core')
export const DESKTOP_DIR = join(REPO_DIR, 'desktop')
export const WORDING_DIR = join(REPO_DIR, 'wording')
export const INSTALLER_DIR = join(REPO_DIR, 'installer')

export const fileUrl = p => pathToFileURL(p).href

export const core = await import(fileUrl(join(CORE_DIR, 'src', 'index.mjs')))
// the scripted connector's prompt readers (titleOf, scoreKeyOf, promptKind): not on the public surface
export const fake = await import(fileUrl(join(CORE_DIR, 'src', 'pipeline', 'fake.mjs')))

export const SCRATCH_ROOT = join(tmpdir(), 'streams-acceptance')

export function caseDir(name) {
  const dir = join(SCRATCH_ROOT, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}
