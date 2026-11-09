#!/usr/bin/env node
// 跑 v2 验收草案 N1–N6 并打一张表（照 ../run.mjs）：node tests/acceptance/v2-draft/run-draft.mjs
// 草案，待 维护者 定：定了之后并入 ../standards.mjs，由 ../run.mjs 一起跑。退出码：有红就 1（哨兵必须红）。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DRAFT, STATUS } from './standards-draft.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rows = []
let red = 0
for (const s of DRAFT) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', join(here, s.file)], { encoding: 'utf8', maxBuffer: 64 << 20 })
  const ok = r.status === 0
  if (!ok) red++
  rows.push(`${s.id.padEnd(4)} ${ok ? 'PASS' : 'FAIL'}  ${s.standard.slice(0, 60)}`)
  if (!ok) rows.push(`     ${(r.stdout + r.stderr).split('\n').filter(l => /^✖|AssertionError|Error:/.test(l)).slice(0, 4).join('\n     ')}`)
}
const sentinel = spawnSync(process.execPath, ['--test', '--test-reporter=spec', join(here, 'sentinel-draft.test.mjs')], { encoding: 'utf8' })
const sentinelOk = sentinel.status !== 0 && /^ℹ fail 1$/m.test(sentinel.stdout) && /^ℹ pass 2$/m.test(sentinel.stdout)
rows.push(`哨兵 ${sentinel.status === 0 ? 'PASS(错！哨兵必须红)' : sentinelOk ? 'FAIL(预期：只红那一条，另两条绿)' : 'FAIL(不止哨兵那一条红，见 sentinel-draft.test.mjs)'}`)
console.log(`v2 验收标准 · ${STATUS}`)
console.log(rows.join('\n'))
console.log(`\n${DRAFT.length - red} / ${DRAFT.length} 通过 · ${new Date().toISOString()}`)
process.exit(red || !sentinelOk ? 1 : 0)
