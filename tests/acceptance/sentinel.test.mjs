// 哨兵：证明这套验收测试在跑、且 V1–V12 每条都有文件。
// (1) 一个故意失败的用例——跑测试的人看见它红，才知道「全绿」不是假的；
// (2) 每个标准都有对应文件，文件里写着它的编号；少一个就红。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STANDARDS } from './standards.mjs'
import { REPLACED } from './replaced.mjs'

const here = dirname(fileURLToPath(import.meta.url))

test('sentinel: this one must always be red (if it is green, the runner is lying)', () => {
  assert.fail('哨兵：这条永远红；它红说明验收测试真的在跑')
})

test('every standard V1–V12 has a test file naming it', () => {
  assert.equal(STANDARDS.length, 12)
  for (const s of STANDARDS) {
    // 1.1.1 P12: a standard 1.1 replaced has its 1.0 test under legacy/ (replaced.mjs)
    const p = join(here, REPLACED[s.id]?.file ?? s.file)
    assert.ok(existsSync(p), `${s.id} 没有测试文件 ${s.file}`)
    assert.ok(readFileSync(p, 'utf8').includes(s.id), `${s.file} 里没有写 ${s.id}`)
  }
})
