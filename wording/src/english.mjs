// The English word list (glossary.json `english`, redesign R6b-3) applied to a pair of dictionaries.
//
//   englishProblems(pairs, english?) -> string[]
//     pairs: [{ key, zh, en }] — every string of the Chinese tables beside the string that stands in for it in English
//     (key as the desktop writes it: '<file>:<EXPORT>.<path>', the main process's tables with a 'main/' prefix).
//     What is reported, one line each:
//       terms    a key the list names does not hold the list's English word, letter for letter
//       pairs    the Chinese string has the word, the English one lacks what it must have or has what it must not
//       banned   an English string has one of the old words (keys on the entry's allow_keys excepted)
//     and a key of the list that the dictionaries do not have (a list that names nothing checks nothing).
//   englishShapeProblems(english?) -> string[]   the list itself: every part there, every pattern compiles, every banned
//     entry's sample is caught by its own pattern.

import { loadGlossary } from './data.mjs'

/** The terms the contract (2026-11-13-r6b R6b-3) asks the list to settle, by their Chinese word. */
export const REQUIRED_ENGLISH_TERMS = ['待看', '库架', '资料库', '问库', '来源与要求', '追踪要求', '主 Agent', '收藏', '放弃', '稍后处理', '忽略', '待确认', '系统检测',
  '运行', '核验的第 n 轮', '核验', '严格程度', '单次运行上限', '缺少文件头', '库内暂无相关内容。', '提示词', '设为当前连接']

const re = (source, flags) => new RegExp(source, flags ?? '')
/** The words of a template: its {placeholders} are names of ours, not words on the screen ({dismissed}, {kept}). */
const wordsOf = text => text.replace(/\{\w+(?:\?[^}]*)?\}/g, m => (m.includes('?') ? m.slice(m.indexOf('?') + 1, -1).replace('|', ' ') : ' '))

export function englishShapeProblems(english = loadGlossary().english) {
  const problems = []
  if (!english || typeof english !== 'object') return ['glossary.json has no english section']
  for (const part of ['terms', 'pairs', 'banned', 'deviations']) if (!Array.isArray(english[part]) || english[part].length === 0) problems.push(`english.${part} is missing or empty`)
  if (problems.length) return problems
  const ids = new Set()
  for (const t of english.terms) {
    if (!t.id || ids.has(t.id)) problems.push(`english.terms: duplicate or empty id ${t.id}`)
    ids.add(t.id)
    if (typeof t.zh !== 'string' || !t.zh.trim() || typeof t.en !== 'string' || !t.en.trim()) problems.push(`english.terms ${t.id}: needs zh and en`)
    if (!Array.isArray(t.keys)) problems.push(`english.terms ${t.id}: keys must be a list`)
  }
  for (const zh of REQUIRED_ENGLISH_TERMS) if (!english.terms.some(t => t.zh === zh)) problems.push(`english.terms: no word for 「${zh}」`)
  for (const p of english.pairs) {
    if (typeof p.zh !== 'string' || !p.zh) problems.push('english.pairs: an entry without zh')
    for (const side of ['must', 'must_not']) if (p[side] !== null && p[side] !== undefined) { try { re(p[side], p.flags) } catch { problems.push(`english.pairs ${p.zh}: ${side} does not compile`) } }
    if (!p.must && !p.must_not) problems.push(`english.pairs ${p.zh}: neither must nor must_not`)
  }
  for (const b of english.banned) {
    let pattern = null
    try { pattern = re(b.re, b.flags) } catch { problems.push(`english.banned ${b.id}: the pattern does not compile`) }
    if (!Array.isArray(b.allow_keys)) problems.push(`english.banned ${b.id}: allow_keys must be a list`)
    if (typeof b.sample !== 'string' || (pattern && !pattern.test(b.sample))) problems.push(`english.banned ${b.id}: its sample is not caught by its pattern`)
    if (Array.isArray(b.allow_keys) && b.allow_keys.length && !b.why_allowed) problems.push(`english.banned ${b.id}: allow_keys without why_allowed`)
  }
  for (const d of english.deviations) {
    for (const f of ['line', 'zh', 'draft', 'ours', 'reason']) if (d[f] === undefined || d[f] === '') problems.push(`english.deviations: an entry without ${f}`)
    if (d.draft === d.ours) problems.push(`english.deviations line ${d.line}: not a deviation`)
  }
  return problems
}

export function englishProblems(pairs, english = loadGlossary().english) {
  const problems = []
  const byKey = new Map(pairs.map(p => [p.key, p]))
  for (const t of english.terms) {
    for (const key of t.keys ?? []) {
      const p = byKey.get(key)
      if (!p) problems.push(`terms ${t.id}: the dictionaries have no key ${key}`)
      else if (p.en !== t.en && p.en.toLowerCase() !== t.en.toLowerCase()) problems.push(`terms ${t.id}: ${key} is "${p.en}", the word list says "${t.en}"`)
      else if (p.en !== t.en && /^[A-Z]/.test(t.en)) problems.push(`terms ${t.id}: ${key} is "${p.en}", the word list writes it "${t.en}"`)
    }
  }
  for (const rule of english.pairs) {
    const must = rule.must ? re(rule.must, rule.flags) : null
    const mustNot = rule.must_not ? re(rule.must_not, rule.flags) : null
    for (const p of pairs) {
      if (!p.zh.includes(rule.zh)) continue
      const said = wordsOf(p.en)
      if (must && !must.test(said)) problems.push(`pairs 「${rule.zh}」: ${p.key} "${p.en}" lacks /${rule.must}/ (${rule.why ?? ''})`)
      if (mustNot && mustNot.test(said)) problems.push(`pairs 「${rule.zh}」: ${p.key} "${p.en}" has /${rule.must_not}/ (${rule.why ?? ''})`)
    }
  }
  for (const b of english.banned) {
    const pattern = re(b.re, b.flags)
    for (const key of b.allow_keys ?? []) if (!byKey.has(key)) problems.push(`banned ${b.id}: the dictionaries have no key ${key} (allow_keys)`)
    for (const p of pairs) if (pattern.test(wordsOf(p.en)) && !(b.allow_keys ?? []).includes(p.key)) problems.push(`banned ${b.id}: ${p.key} "${p.en}" (say ${b.instead})`)
  }
  return problems
}
