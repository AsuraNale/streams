// 一次性生成占位测试文件（已生成的不覆盖）：node tests/acceptance/gen-placeholders.mjs
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STANDARDS } from './standards.mjs'

const here = dirname(fileURLToPath(import.meta.url))
for (const s of STANDARDS) {
  const p = join(here, s.file)
  if (existsSync(p)) continue
  const src = `// ${s.id} · ${s.standard}
// 怎么核：${s.how}
// 占位（2026-11-02）：实装时把 notYet 换成真的核法，并保留一条故意失败的反向用例。
import { test } from 'node:test'
import { notYet } from './placeholder.mjs'

test('${s.id}: ${s.standard.replace(/'/g, '’')}', () => {
  notYet('${s.id}')
})
`
  writeFileSync(p, src, 'utf8')
  console.log('wrote', s.file)
}
