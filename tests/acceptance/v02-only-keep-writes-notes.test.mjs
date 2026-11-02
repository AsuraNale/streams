// V2 · 没有任何条目不经用户点收藏进入 notes/
// 怎么核：代码里只有一处写 notes/ 的函数，且只被收藏动作和导入写头调用；变异测试：去掉那个调用守卫，测试必须变红
// 占位（2026-11-02）：实装时把 notYet 换成真的核法，并保留一条故意失败的反向用例。
import { test } from 'node:test'
import { notYet } from './placeholder.mjs'

test('V2: 没有任何条目不经用户点收藏进入 notes/', () => {
  notYet('V2')
})
