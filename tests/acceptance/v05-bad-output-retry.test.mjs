// V5 · 模型输出坏格式时重试一次，再坏就标未评分，条目不丢
// 怎么核：假连接器
// 占位（2026-11-02）：实装时把 notYet 换成真的核法，并保留一条故意失败的反向用例。
import { test } from 'node:test'
import { notYet } from './placeholder.mjs'

test('V5: 模型输出坏格式时重试一次，再坏就标未评分，条目不丢', () => {
  notYet('V5')
})
