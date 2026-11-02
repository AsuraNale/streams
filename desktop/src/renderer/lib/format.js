// Filling the text tables' placeholders, and dates as the page shows them. No words here: the templates
// come from src/renderer/texts/ (zh) or src/renderer/texts-en/ (en, served in their place: docs/desktop.md��), so
// the wording check sees every word the page writes.
//
//   {name}             a value, as text; an unknown {name} is left as it is
//   {name?one|other}   English plurals: `one` when the value is exactly 1, `other` otherwise ('{n} card{n?|s}' → 1 card, 3 cards;
//                      '{n?is|are}'); the Chinese tables never use it

/** The two token forms, for anyone who needs to find them (test/texts-en.test.mjs compares the placeholder sets). */
export const PLACEHOLDER = /\{(\w+)\}/g
export const PLURAL = /\{(\w+)\?([^|}]*)\|([^}]*)\}/g
const TOKEN = /\{(\w+)\?([^|}]*)\|([^}]*)\}|\{(\w+)\}/g

/**
 * A template cut into its pieces, in order: `{ text }`, `{ key, raw }` for a placeholder, `{ key, one, other, raw }` for
 * a plural token. `raw` is the token as written, to leave in place when the value is missing.
 */
export function tokens(template) {
  const s = String(template)
  const out = []
  let last = 0
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    if (m[4] !== undefined) out.push({ key: m[4], raw: m[0] })
    else out.push({ key: m[1], one: m[2], other: m[3], raw: m[0] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out
}

/** Is there a value for `key` (null and undefined count as none)? */
export const hasValue = (values, key) => Object.hasOwn(values, key) && values[key] !== null && values[key] !== undefined

/** fmt('第 {n} 次确认 · {doc}', { n: 2, doc: '资料汇编' }) — an unknown {name} is left as it is. */
export function fmt(template, values = {}) {
  let out = ''
  for (const t of tokens(template)) {
    if (t.text !== undefined) { out += t.text; continue }
    if (!hasValue(values, t.key)) { out += t.raw; continue }
    out += t.one !== undefined ? (Number(values[t.key]) === 1 ? t.one : t.other) : String(values[t.key])
  }
  return out
}

const pad = n => String(n).padStart(2, '0')
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** The page's language, as app.js set it on <html> from the brand table; zh-CN before that and outside a page (plain Node). */
export const pageLocale = () => (typeof document !== 'undefined' && document.documentElement?.lang) || 'zh-CN'

// one month formatter per locale (Intl: 「10月」 in Chinese, "Oct" in English); a locale Intl does not know falls back to English
const months = new Map()
function monthShort(date, locale) {
  let f = months.get(locale)
  if (!f) {
    try { f = new Intl.DateTimeFormat(locale, { month: 'short' }) } catch { f = new Intl.DateTimeFormat('en', { month: 'short' }) }
    months.set(locale, f)
  }
  return f.format(date)
}

/**
 * Which day a moment is, seen from `now` (local time): today / yesterday / another date; the parts the date templates
 * use (`hm` 16:05, `m` the month as a number, `d` the day, `mon` the month's short name in the page's language).
 * Null for a bad date.
 */
export function whenParts(iso, now = new Date()) {
  const d = new Date(iso)
  if (typeof iso !== 'string' || Number.isNaN(d.getTime())) return null
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000)
  return { day: days === 0 ? 'today' : days === 1 ? 'yesterday' : 'date', hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`, m: d.getMonth() + 1, d: d.getDate(), mon: monthShort(d, pageLocale()) }
}

/** A moment with its time: 「今天 16:05」 / 「昨天 16:05」 / 「9-30 16:05」 (templates: texts/common.js WHEN). */
export function whenText(iso, templates, now = new Date()) {
  const p = whenParts(iso, now)
  if (!p) return null
  return fmt(templates[p.day], p)
}

/** Just the day: 「今天」 / 「昨天」 / 「9-30」 (templates: texts/common.js DAY). */
export function dayText(iso, templates, now = new Date()) {
  const p = whenParts(iso, now)
  if (!p) return null
  return fmt(templates[p.day], p)
}
