// V10 · 每轮上限生效：上限设 5，第 6 条不调模型，剩余条目下一轮接着跑
// 怎么核：假连接器计数
// 占位（2026-11-02）：实装时把 notYet 换成真的核法，并保留一条故意失败的反向用例。
import { test } from 'node:test'
import { notYet } from './placeholder.mjs'

test('V10: 每轮上限生效：上限设 5，第 6 条不调模型，剩余条目下一轮接着跑', () => {
  notYet('V10')
})
