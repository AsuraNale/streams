#!/usr/bin/env node
// 跑 V1–V12 并打一张表：node tests/acceptance/run.mjs
// 退出码：有红就 1。占位阶段预期全红（外加永远红的哨兵）。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STANDARDS } from './standards.mjs'
import { REPLACED } from './replaced.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rows = []
let red = 0
let replaced = 0
for (const s of STANDARDS) {
  // 1.1.1 P12 (待办 D2): a 1.0 standard that 1.1 replaced is not run here; the 1.1 item named checks it (replaced.mjs)
  if (REPLACED[s.id]) { replaced++; rows.push(`${s.id.padEnd(4)} 已被取代  由 1.1 的 ${REPLACED[s.id].by} 核：${REPLACED[s.id].why}`); continue }
  const r = spawnSync(process.execPath, ['--test', join(here, s.file)], { encoding: 'utf8' })
  const ok = r.status === 0
  if (!ok) red++
  rows.push(`${s.id.padEnd(4)} ${ok ? 'PASS' : 'FAIL'}  ${s.standard.slice(0, 60)}`)
}
const sentinel = spawnSync(process.execPath, ['--test', join(here, 'sentinel.test.mjs')], { encoding: 'utf8' })
rows.push(`哨兵 ${sentinel.status === 0 ? 'PASS(错！哨兵必须红)' : 'FAIL(预期)'}`)
console.log(rows.join('\n'))
console.log(`\n${STANDARDS.length - replaced - red} / ${STANDARDS.length - replaced} 通过（另 ${replaced} 条已被 1.1 的条目取代）· ${new Date().toISOString()}`)
process.exit(red || sentinel.status === 0 ? 1 : 0)
