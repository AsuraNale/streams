// v2 draft: a copy of the core AND of the desktop's main process with one change made on purpose (a mutant), to show that a
// check fails when the thing it checks is taken out. Like ../../support/mutant.mjs (the core alone), but the desktop's
// services come along: core/src, desktop/src/main and desktop/src/shared are copied into a scratch folder in the
// repository's own layout (so desktop/src/main/core.mjs's `../../../core/src/index.mjs` lands on the copied core), the
// edits are applied to the copy (each `from` must occur exactly once in its file: an edit that no longer applies is an
// error, never a silent no-op), and modules are imported from the copy. The real files are never touched: their hashes
// are taken before and compared after (`untouched()`).
//
//   const m = await mutantApp('n01-no-pending-guard', [{ file: 'core/src/proposals/proposals.mjs', from: '…', to: '…' }])
//   const { createProposalsService } = await m.desktop('services/proposals.mjs')
//   const core = await m.core()
//   m.untouched()   → true when every original file the edits named is byte for byte what it was
//
// realApp() gives the same three functions on the repository itself (the control), so a test runs one scenario on both.
import { createHash } from 'node:crypto'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_DIR, caseDir, fileUrl } from '../../support/paths.mjs'

const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')

export function realApp() {
  return {
    root: REPO_DIR,
    core: () => import(fileUrl(join(REPO_DIR, 'core', 'src', 'index.mjs'))),
    desktop: rel => import(fileUrl(join(REPO_DIR, 'desktop', 'src', 'main', rel))),
    untouched: () => true,
  }
}

export async function mutantApp(name, edits) {
  const before = Object.fromEntries(edits.map(e => [e.file, sha(join(REPO_DIR, e.file))]))
  const root = caseDir(`mutant-app-${name}`)
  cpSync(join(REPO_DIR, 'core', 'src'), join(root, 'core', 'src'), { recursive: true })
  cpSync(join(REPO_DIR, 'desktop', 'src', 'main'), join(root, 'desktop', 'src', 'main'), { recursive: true })
  cpSync(join(REPO_DIR, 'desktop', 'src', 'shared'), join(root, 'desktop', 'src', 'shared'), { recursive: true })
  for (const d of ['core', 'desktop']) writeFileSync(join(root, d, 'package.json'), '{ "type": "module" }\n', 'utf8')
  for (const { file, from, to } of edits) {
    const p = join(root, file)
    const text = readFileSync(p, 'utf8')
    const count = text.split(from).length - 1
    if (count !== 1) throw new Error(`mutant ${name}: ${file} has ${count} occurrences of ${JSON.stringify(from)}, expected exactly 1`)
    writeFileSync(p, text.replace(from, () => to), 'utf8')
  }
  return {
    root,
    core: () => import(fileUrl(join(root, 'core', 'src', 'index.mjs'))),
    desktop: rel => import(fileUrl(join(root, 'desktop', 'src', 'main', rel))),
    untouched: () => edits.every(e => sha(join(REPO_DIR, e.file)) === before[e.file]),
  }
}
