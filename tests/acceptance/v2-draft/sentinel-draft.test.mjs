// 草案的哨兵（照 ../sentinel.test.mjs）：证明 N1–N6 这套测试在跑，且每条都有文件。
// (1) 一个故意失败的用例——它红，才知道「全绿」不是假的；
// (2) 每条 N 都有对应文件，文件里写着它的编号和标准原文（architecture.md 第五节的那句，反引号不计）；少一个就红；
// (3) 草案的标准原文与 architecture.md 第五节表里的逐字一致；V1–V12 每条都有建议改字（只是建议）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DRAFT, STATUS, V_SUGGESTIONS } from './standards-draft.mjs'
import { STANDARDS } from '../standards.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ARCH = join(here, '..', '..', '..', 'docs', 'design', 'v2', 'architecture.md')
const plain = s => s.replace(/`/g, '')

test('sentinel (draft): this one must always be red (if it is green, the runner is lying)', () => {
  assert.fail('哨兵：这条永远红；它红说明 N1–N6 草案测试真的在跑')
})

test('every draft standard N1–N6 has a test file naming it and quoting it', () => {
  assert.equal(STATUS, '草案，待 维护者 定')
  assert.deepEqual(DRAFT.map(d => d.id), ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'])
  for (const d of DRAFT) {
    const p = join(here, d.file)
    assert.ok(existsSync(p), `${d.id} 没有测试文件 ${d.file}`)
    const text = readFileSync(p, 'utf8')
    assert.ok(text.includes(d.id), `${d.file} 里没有写 ${d.id}`)
    assert.ok(text.includes(plain(d.standard)), `${d.file} 里没有标准原文`)
  }
})

test('the draft quotes architecture.md 第五节 word for word; V1–V12 each have a suggestion with a reason', () => {
  const md = readFileSync(ARCH, 'utf8')
  const section = md.slice(md.indexOf('## 五、怎么验'), md.indexOf('## 六、'))
  const rows = Object.fromEntries([...section.matchAll(/^\| (N\d) \| (.+) \|$/gm)].map(m => [m[1], m[2]]))
  for (const d of DRAFT) assert.equal(d.standard, rows[d.id], `${d.id} differs from architecture.md`)
  assert.deepEqual(V_SUGGESTIONS.map(v => v.id), STANDARDS.map(s => s.id))
  for (const v of V_SUGGESTIONS) assert.ok(v.suggest && v.why, v.id)
})
