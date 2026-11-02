// V6 · 登录过期时，当轮不开始，首页横幅说明，抓到的条目完整保留
// 怎么核：假连接器返回登录过期文案
// 占位（2026-11-02）：实装时把 notYet 换成真的核法，并保留一条故意失败的反向用例。
import { test } from 'node:test'
import { notYet } from './placeholder.mjs'

test('V6: 登录过期时，当轮不开始，首页横幅说明，抓到的条目完整保留', () => {
  notYet('V6')
})
