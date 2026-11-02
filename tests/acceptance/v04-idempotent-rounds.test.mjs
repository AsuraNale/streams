// V4 · 没有新数据连跑两轮，第二轮账本、索引、inbox 零改动
// 怎么核：比对文件哈希
// 占位（2026-11-02）：实装时把 notYet 换成真的核法，并保留一条故意失败的反向用例。
import { test } from 'node:test'
import { notYet } from './placeholder.mjs'

test('V4: 没有新数据连跑两轮，第二轮账本、索引、inbox 零改动', () => {
  notYet('V4')
})
