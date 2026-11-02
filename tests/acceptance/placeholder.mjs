// 占位：标准还没实装时，测试必须是红的（FAIL），不是 skip / todo。
// 实装某条标准时，把该文件里的 notYet() 换成真的核法；本函数本身保留给以后新标准用。
import assert from 'node:assert/strict'
import { STANDARDS } from './standards.mjs'

export function standardOf(id) {
  const s = STANDARDS.find(x => x.id === id)
  if (!s) throw new Error(`no standard ${id}`)
  return s
}

export function notYet(id, note = '') {
  const s = standardOf(id)
  assert.fail(`${id} 未实装：${s.standard}${note ? `（${note}）` : ''}`)
}
