// 1.1 acceptance C1 (W7b), over the desktop this file lives in: core/test/c1-scan.test.mjs scans the repository's core/src and
// desktop/src; this file runs the same scanner (its scanText / legacyImports / codeFiles, imported — so core's own three tests of
// the scan run here as well) over the desktop/src beside it. In the repository that is the same folder; in a copy made by
// scripts/mutation-check.mjs it is the copy, which the core's scan never sees (core/ is a link there, and its scan reads the
// repository it lives in). So a mutant that puts a scoring word back into desktop/src is reported.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { codeFiles, legacyImports, scanText } from '../../core/test/c1-scan.test.mjs'

// the folder that holds this desktop/ (the repository, or a mutant's copy)
const ROOT = join(DESKTOP_DIR, '..')

test('C1 desktop · this desktop/src names no relevance / substance / threshold / strictness / rescore (相关度 / 实质 / 阈值 / 严格程度), and imports nothing of core/legacy', () => {
  const files = codeFiles('desktop/src', { repo: ROOT })
  assert.ok(files.length > 40, `control: the scan reads the desktop's code (${files.length} files)`)
  assert.ok(files.includes('desktop/src/main/services/pipeline.mjs') && files.includes('desktop/src/renderer/screens/inbox.js'), 'control: the files the product runs are scanned')
  assert.ok(!files.some(f => /^desktop\/src\/(renderer|main)\/texts/.test(f)), 'control: the word files are not (E4 reads those: test/wording.test.mjs)')
  const hits = files.flatMap(f => scanText(f, readFileSync(join(ROOT, f), 'utf8'), []))
  assert.deepEqual(hits, [], hits.map(h => `${h.file}:${h.line}  ${h.text}`).join('\n'))
  const legacy = files.flatMap(f => legacyImports(f, readFileSync(join(ROOT, f), 'utf8')))
  assert.deepEqual(legacy, [], legacy.map(h => `${h.file}:${h.line}  ${h.text}`).join('\n'))
  // the reverse control, on a line of a desktop file
  assert.equal(scanText('desktop/src/main/services/pipeline.mjs', 'if (score.relevance >= threshold) keep()', []).length, 1)
})
