// A copy of the core with one change made on purpose (a mutant), to show that a check fails when the thing it checks
// is taken out. The real files are never touched: core/src is copied into a scratch folder, the edits are applied to
// the copy (each `from` must occur exactly once, so an edit that no longer applies is an error, not a silent no-op),
// and the copy's src/index.mjs is imported as a fresh module.
//
//   const m = await mutantCore('v02-no-by-guard', [{ file: 'library/write-note.mjs', from: '…', to: '…' }])
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORE_DIR, caseDir, fileUrl } from './paths.mjs'

export async function mutantCore(name, edits) {
  const root = caseDir(`mutant-${name}`)
  cpSync(join(CORE_DIR, 'src'), join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n', 'utf8')
  for (const { file, from, to } of edits) {
    const p = join(root, 'src', file)
    const text = readFileSync(p, 'utf8')
    const count = text.split(from).length - 1
    if (count !== 1) throw new Error(`mutant ${name}: ${file} has ${count} occurrences of ${JSON.stringify(from)}, expected exactly 1`)
    writeFileSync(p, text.replace(from, to), 'utf8')
  }
  return import(fileUrl(join(root, 'src', 'index.mjs')))
}
