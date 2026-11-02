// Banned-term scanner (V7): the tests run it over every interface string (desktop/test/wording.test.mjs), and the
// pipeline will run it over what a model writes for the user (the 「这是什么」 line, plan C5) before showing it; any hit
// means a rewrite.
//
// ⛔ It scans *structured user-copy fields only* — never whole files. Inside a scanned field it skips what is not our own
// wording: 《titles》, web links, and quotes / quote blocks that match the user's own words (see buildMask).
//
// Rules, inherited from the earlier shell's scanner:
//  - cards and dictionaries are always strict: a quote is the user's only when it matches what the user wrote
//    (userText), verbatim after folding variants. Cue words (原话、原文…) count only in the loose mode, which only
//    scanText offers (free chat text).
//  - terms are matched on a normalised view of the text (normalize.mjs): full-width, zero-width characters, spaces
//    between Han characters, traditional forms; plurals.
//  - allowed uses are exceptions (except_re: the sentences V7 allows a brand name in).
//  - a quote is checked as whole words inside one user message; a lazy continuation line is part of its quote block;
//    a link ends where Chinese text starts; our own file names count even inside 《》 (in_titles).

import { loadBannedTerms, loadGlossary } from './data.mjs'
import { entriesById } from './glossary.mjs'
import { buildView, containsQuote, flatten, quoteKey, showInvisible } from './normalize.mjs'

/**
 * Card fields that reach the user (an item in 待看 as the pipeline will show it: a head line, a question, a detail, the
 * choices). `id` and `approve` do not; quotes / references / sources are excluded on purpose (they are other people's
 * words); `kind` and `recommend` are machine values, never scanned.
 */
export const CARD_TEXT_FIELDS = ['header', 'question', 'detail', 'report_name', 'thesis', 'why', 'changes']
export const OPTION_TEXT_FIELDS = ['label', 'description', 'effect']
export const EXCLUDED_CARD_FIELDS = ['id', 'approve', 'kind', 'recommend', 'changes_plan', 'quotes', 'references', 'citations', 'sources']

const ASCII_BEFORE = '(?<![A-Za-z0-9_])'
const ASCII_AFTER = '(?![A-Za-z0-9_])'
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '0.0.0.0'])
const QUOTE_PAIRS = [['「', '」'], ['“', '”'], ['"', '"'], ['『', '』']]
// A web link ends where Chinese text starts (W3-2): in 「详见 https://x.com/a对接窗口已过」 the Chinese after
// the link is the agent's sentence, not part of the address. A file: link keeps its Chinese (file:资料/第二版):
// a path on this machine is flagged as a whole either way (env:local-link), so nothing hides in it.
const URL_RE = /(?:https?:\/\/[^\s<>()（）「」『』"“”'\]，。；：、！？】》\p{Script=Han}]+|file:[^\s<>()（）「」『』"“”'\]，。；：、！？】》]+)/giu
const empty = () => ({ ok: true, hits: [], skipped: [], advisories: [] })

const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One banned term as a regex source: the word, its plural if the group allows one, its other forms. */
function termSource(term, plurals) {
  if (term.re) return term.re
  const spelled = escapeRe(term.t).replace(/ /gu, '\\s+')
  // -s / -es in either case, so FAILS and PASSES are caught even where the word itself is case-sensitive
  const plural = plurals && /^[A-Za-z]+$/u.test(term.t) ? '(?:[Ee]?[Ss])?' : ''
  return [`${spelled}${plural}`, ...(term.forms ?? []).map(escapeRe)].join('|')
}

/**
 * Compile banned-terms.json into matchers. Exported so tests can check that
 * every term can actually fire. Matchers run on the normalised view (normalize.mjs).
 */
export function compileMatchers(banned = loadBannedTerms()) {
  const matchers = []
  let order = 0
  for (const group of banned.hard) {
    for (const term of group.terms) {
      const boundary = term.boundary ?? group.boundary ?? 'none'
      const flags = term.flags ?? group.flags ?? ''
      const core = termSource(term, term.plurals ?? group.plurals ?? false)
      const source = boundary === 'ascii-word' ? `${ASCII_BEFORE}(?:${core})${ASCII_AFTER}` : core
      matchers.push({
        rule: `${group.id}:${term.t ?? term.re}`,
        group: group.id,
        label: group.label,
        re: new RegExp(source, `gu${flags}`),
        exceptRes: (term.except_re ?? []).map(x => new RegExp(x.re, `gu${x.flags ?? flags}`)),
        // flagged even inside 《》: words that never occur in a real title (W3-2)
        inTitles: term.in_titles ?? group.in_titles ?? false,
        term,
        order: order++,
      })
    }
  }
  return matchers
}

function compileSoft(banned) {
  return (banned.soft ?? []).map((item, order) => ({
    rule: `soft:${item.id}`,
    re: new RegExp(item.re ?? escapeRe(item.t), 'gu'),
    item,
    order,
  }))
}

let compiled = null
function defaults() {
  if (compiled === null) {
    const banned = loadBannedTerms()
    compiled = {
      banned,
      traditional: banned.normalize?.traditional ?? {},
      matchers: compileMatchers(banned),
      soft: compileSoft(banned),
      entries: entriesById(loadGlossary()),
    }
  }
  return compiled
}

const userMessagesOf = opts => typeof opts.userText === 'string' ? [opts.userText]
  : Array.isArray(opts.userText) ? opts.userText.filter(m => typeof m === 'string') : []

// userText can be a whole commission and is the same for every field of a card: fold it once.
// Each message stays apart (W3-2): a quote has to sit inside one message, not straddle two.
// The cache is keyed by content, not by the array object (callers may push onto the same array).
let userCache = { id: null, keys: [], lower: [] }
function userFolded(opts, traditional) {
  const messages = userMessagesOf(opts)
  const id = JSON.stringify(messages)
  if (id !== userCache.id) {
    const keys = messages.map(m => quoteKey(m, traditional))
    userCache = { id, keys, lower: keys.map(k => k.toLowerCase()) }
  }
  return userCache
}

/** Replace each false cue (原文件…) with spaces of the same length, so windows keep their offsets. */
function withoutFalseCues(text, notCues) {
  let out = text
  for (const word of notCues) out = out.replaceAll(word, ' '.repeat(word.length))
  return out
}

/**
 * Mark the spans of `text` that are not the agent's own wording.
 * Works on the original text; quotes are compared with userText after folding variants.
 * @param {boolean} loose - accept cue words as evidence of a quote (free chat text only)
 * @returns {{mask: Uint8Array, skipped: object[], localLinks: object[]}}
 */
function buildMask(text, opts, banned, traditional, loose) {
  const mask = new Uint8Array(text.length)
  // the same, without 《titles》: a word marked in_titles is the agent's even inside one (W3-2)
  const plain = new Uint8Array(text.length)
  const skipped = []
  const localLinks = []
  const mark = (start, end, kind) => {
    mask.fill(1, start, end)
    if (kind !== 'title') plain.fill(1, start, end)
    skipped.push({ kind, text: text.slice(start, end), start, end })
  }

  const { keys } = userFolded(opts, traditional)
  // Verbatim after folding variants and spacing, as whole words, inside one message (W3-2); two
  // characters at least, so a stray 「」 cannot pass.
  const verified = snippet => {
    if (keys.length === 0) return false
    const said = quoteKey(snippet, traditional)
    return said.replace(/ /gu, '').length >= 2 && keys.some(key => containsQuote(key, said))
  }
  const cues = banned.quote_cues?.words ?? []
  const windowSize = banned.quote_cues?.window ?? 12
  const cueText = loose ? withoutFalseCues(text, banned.quote_cues?.not_cues ?? []) : text
  const hasCue = snippet => loose && cues.some(cue => snippet.includes(cue))

  // 1. markdown quote blocks (lines starting with '>'). ⛔ Not skipped just for being
  // a quote block: agents also use '>' for notes, and a whole card pasted as a
  // quote would otherwise pass untouched. Each line is skipped when it is found in
  // userText; in the loose mode, a cue word right before the block skips all of it.
  const lines = text.split('\n')
  const cueLines = cueText.split('\n')
  const starts = []
  let pos = 0
  for (const line of lines) {
    starts.push(pos)
    pos += line.length + 1
  }
  const isQuoteLine = line => /^[ \t]{0,3}>/u.test(line)
  const bodyOf = line => (isQuoteLine(line) ? line.replace(/^[ \t]{0,3}(?:>[ \t]?)+/u, '') : line)
  // a line that starts something else is not a lazy continuation: list item, heading, code fence, rule
  const newBlock = line => /^[ \t]{0,3}(?:[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|#{1,6}(?:[ \t]|$)|```|~~~|(?:[-*_][ \t]*){3,}$)/u.test(line)
  for (let i = 0; i < lines.length;) {
    if (!isQuoteLine(lines[i])) { i++; continue }
    // The block: the '>' lines, and lazy continuation lines — markdown shows a plain line right after a
    // quoted line of text as part of the quote (W3-2), so it is checked like one.
    let j = i + 1
    for (;;) {
      if (j < lines.length && isQuoteLine(lines[j])) { j++; continue }
      if (j < lines.length && lines[j].trim() !== '' && bodyOf(lines[j - 1]).trim() !== '' && !newBlock(lines[j])) { j++; continue }
      break
    }
    let prev = ''
    for (let k = i - 1; k >= 0; k--) if (cueLines[k].trim() !== '') { prev = cueLines[k]; break }
    if (hasCue(prev.slice(-windowSize - 8)) || hasCue(bodyOf(cueLines[i]).slice(0, windowSize))) {
      mark(starts[i], starts[j - 1] + lines[j - 1].length, 'blockquote-cue')
    } else {
      // the block as a whole first (W3-2 review): a sentence the user wrote, quoted over two lines, is theirs
      // with the line break in it — a word split across the two lines is then theirs as well
      if (j - i > 1 && verified(lines.slice(i, j).map(bodyOf).join('\n'))) mark(starts[i], starts[j - 1] + lines[j - 1].length, 'blockquote-verified')
      else for (let k = i; k < j; k++) if (verified(bodyOf(lines[k]))) mark(starts[k], starts[k] + lines[k].length, 'blockquote-verified')
    }
    i = j
  }

  // 2. 《titles》 of cited works
  // in_titles words are the agent's even inside one — unless the title is one the user wrote (W3-2 review)
  for (const m of text.matchAll(/《[^《》\n]*》/gu)) mark(m.index, m.index + m[0].length, verified(m[0].slice(1, -1)) ? 'title-verified' : 'title')

  // 3. links: a web link is a citation, not wording; a link to this machine is its own problem
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0]
    const rawHost = /^file:/iu.test(url) ? 'file:' : (url.match(/^https?:\/\/(\[[^\]]*\]|[^/:?#]+)/iu)?.[1] ?? '')
    // folded like the text itself, so ｌｏｃａｌｈｏｓｔ or a zero-width character inside 127.0.0.1 is still this machine
    const host = flatten(rawHost, traditional).toLowerCase().replace(/\.$/u, '')
    if (host === 'file:' || LOCAL_HOSTS.has(host)) {
      // Reported as a hit by scanOne; masked here so the address inside is not counted twice.
      localLinks.push({ start: m.index, end: m.index + url.length, text: url })
      mask.fill(1, m.index, m.index + url.length)
      plain.fill(1, m.index, m.index + url.length)
      continue
    }
    mark(m.index, m.index + url.length, 'url')
  }

  // 4. inline quotes of the user's words: verified against userText (or, loose mode only, a cue word right before)
  for (const [open, close] of QUOTE_PAIRS) {
    const re = new RegExp(`${escapeRe(open)}([^${escapeRe(open)}${escapeRe(close)}\\n]*)${escapeRe(close)}`, 'gu')
    for (const m of text.matchAll(re)) {
      if (mask[m.index]) continue
      let kind = null
      if (verified(m[1])) kind = 'quote-verified'
      else {
        const lineStart = text.lastIndexOf('\n', m.index - 1) + 1
        if (hasCue(cueText.slice(Math.max(lineStart, m.index - windowSize), m.index))) kind = 'quote-cue'
      }
      if (kind !== null) mark(m.index, m.index + m[0].length, kind)
    }
  }
  return { mask, plain, skipped, localLinks }
}

/** Skipped only when every character of the hit is someone else's words (a quote, a title, a link). */
const fullyMasked = (mask, start, end) => {
  for (let i = start; i < end; i++) if (!mask[i]) return false
  return true
}

function insideCompound(text, start, end, compounds) {
  for (const compound of compounds) {
    let from = Math.max(0, start - compound.length)
    for (;;) {
      const at = text.indexOf(compound, from)
      if (at < 0 || at > start) break
      if (at <= start && at + compound.length >= end) return compound
      from = at + 1
    }
  }
  return null
}

function position(text, index) {
  const before = text.slice(0, index)
  const line = before.split('\n').length
  const column = index - (before.lastIndexOf('\n') + 1) + 1
  return { line, column }
}

function context(text, start, end, radius = 12) {
  const left = text.slice(Math.max(0, start - radius), start)
  const right = text.slice(end, end + radius)
  return `${left}【${text.slice(start, end)}】${right}`.replace(/\s+/gu, ' ')
}

function suggestionFor(matcher, said, entries) {
  if (matcher.term.suggest) return matcher.term.suggest
  const entry = entries.get(matcher.term.see)
  if (!entry) return null
  const needles = [said, matcher.term.t].filter(Boolean).map(w => w.toLowerCase())
  const exact = entry.terms.find(t => t.zh && t.action !== 'keep' && t.internal.some(w => needles.includes(w.toLowerCase())))
  if (exact) return exact.gloss ? `${exact.zh}（${exact.gloss}）` : exact.zh
  const zh = entry.terms.filter(t => t.zh && t.action !== 'keep').map(t => t.zh)
  if (zh.length) return zh.join(' / ')
  const note = entry.terms.find(t => t.note)?.note
  return note ? `不要对用户提（${note}）` : '不要对用户提'
}

function scanOne(text, opts, field, loose) {
  const { banned, traditional, matchers, soft, entries } = defaults()
  if (typeof text !== 'string' || text.length === 0) return empty()

  const { mask, plain, skipped, localLinks } = buildMask(text, opts, banned, traditional, loose)
  const view = buildView(text, traditional)
  const source = (a, b) => [view.from[a], view.to[b - 1]]
  const fold = word => flatten(word, traditional).toLowerCase()
  const allow = new Set((opts.allow ?? []).map(fold))
  // whole words, inside one message, like a quote (W3-2): "scoped" does not make "scope" the user's word
  const userLower = opts.domainFromUserText ? userFolded(opts, traditional).lower : []
  const userUsed = word => userLower.some(key => containsQuote(key, word))

  const raw = []
  for (const link of localLinks) {
    raw.push({
      start: link.start, end: link.end, text: link.text, normalized: link.text, order: -1,
      rule: 'env:local-link', group: 'env-files', label: '环境 / 文件',
      see: 'environment', suggestion: '不给本机链接：在应用里直接打开，或者只说材料的名字',
    })
  }
  for (const matcher of matchers) {
    let domain = null
    for (const m of view.text.matchAll(matcher.re)) {
      const a = m.index
      const b = a + m[0].length
      if (b === a) continue
      const [start, end] = source(a, b)
      if (fullyMasked(plain, start, end)) continue                          // a quote, a link
      if (fullyMasked(mask, start, end) && !matcher.inTitles) continue    // inside 《a title》
      const compound = insideCompound(view.text, a, b, matcher.term.except ?? [])
      if (compound) { skipped.push({ kind: 'compound', text: compound, start, end }); continue }
      domain ??= matcher.exceptRes.flatMap(re => [...view.text.matchAll(re)].map(x => [x.index, x.index + x[0].length]))
      const use = domain.find(([s, e]) => s <= a && b <= e)
      if (use) {
        const [s, e] = source(use[0], use[1])
        skipped.push({ kind: 'domain', text: text.slice(s, e), start, end })
        continue
      }
      const said = fold(m[0])
      const base = matcher.term.t ? fold(matcher.term.t) : null
      const usedAs = word => userUsed(quoteKey(word, traditional).toLowerCase())
      if (allow.has(said) || (base && allow.has(base)) || usedAs(m[0]) || (matcher.term.t && usedAs(matcher.term.t))) {
        skipped.push({ kind: 'allow', text: text.slice(start, end), start, end })
        continue
      }
      raw.push({
        start, end, text: text.slice(start, end), normalized: m[0], order: matcher.order,
        rule: matcher.rule, group: matcher.group, label: matcher.label,
        see: matcher.term.see ?? null, suggestion: suggestionFor(matcher, m[0], entries),
      })
    }
  }

  // Keep the widest hit where one contains another (闸门层 over 闸门, gate1_awaiting once).
  raw.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order)
  const kept = []
  for (const hit of raw) {
    if (kept.some(k => k.start <= hit.start && hit.end <= k.end)) continue
    kept.push(hit)
  }

  const hits = kept.map(hit => ({
    rule: hit.rule,
    group: hit.group,
    label: hit.label,
    text: hit.text,
    normalized: hit.normalized,
    field,
    ...position(text, hit.start),
    start: hit.start,
    end: hit.end,
    context: context(text, hit.start, hit.end),
    see: hit.see,
    suggestion: hit.suggestion,
  }))

  const advisories = []
  if (opts.advise) {
    for (const s of soft) {
      for (const m of view.text.matchAll(s.re)) {
        if (m[0].length === 0) continue
        const [start, end] = source(m.index, m.index + m[0].length)
        if (fullyMasked(mask, start, end)) continue
        if (hits.some(h => h.start <= start && end <= h.end)) continue
        advisories.push({ rule: s.rule, text: text.slice(start, end), normalized: m[0], field, ...position(text, start), note: s.item.note })
      }
    }
  }

  return { ok: hits.length === 0, hits, skipped: skipped.map(s => ({ ...s, field })), advisories }
}

/**
 * Scan one piece of user-facing text.
 * @param {string} text
 * @param {object} [opts]
 * @param {string|string[]} [opts.userText] - what the user wrote (commission, messages) — the user's
 *   words only, never the agent's. A quote or quote-block line found in it verbatim is skipped.
 * @param {boolean} [opts.quoteCues] - loose mode, for free chat text only: a cue word (原话、你说、委托里…)
 *   right before a quote also makes it the user's. Cards and UI strings refuse this option.
 * @param {boolean} [opts.domainFromUserText] - a banned word the user themselves used (e.g. 闸门 in a water project) is not flagged.
 * @param {string[]} [opts.allow] - words the caller allows for this project.
 * @param {boolean} [opts.advise] - also list soft-list advisories (never affect `ok`).
 * @param {string} [field] - field path, copied onto each hit.
 * @returns {{ok: boolean, hits: object[], skipped: object[], advisories: object[]}}
 *   Each hit: `text` as written (original), `normalized` as matched (e.g. 預註冊 → 预注册),
 *   `start`/`end`/`line`/`column` in the original text.
 */
export function scanText(text, opts = {}, field = '') {
  return scanOne(text, opts, field, opts.quoteCues === true)
}

/** Cards and UI strings are checked strictly: no cue-word shortcut, whatever the caller passes. */
function strictOnly(opts, fn) {
  if (opts?.quoteCues) {
    throw new TypeError(`${fn}: cards and UI strings are always scanned strictly (a quote counts as the user's only when it matches userText); quoteCues is for free chat text through scanText`)
  }
}

function merge(results) {
  const out = empty()
  for (const r of results) {
    out.hits.push(...r.hits)
    out.skipped.push(...r.skipped)
    out.advisories.push(...r.advisories)
  }
  out.ok = out.hits.length === 0
  return out
}

function scanCardFields(card, opts, prefix) {
  if (card === null || typeof card !== 'object') throw new TypeError('scanCard: card must be an object')
  const results = []
  for (const field of CARD_TEXT_FIELDS) {
    if (typeof card[field] === 'string') results.push(scanOne(card[field], opts, `${prefix}${field}`, false))
  }
  if (Array.isArray(card.options)) {
    card.options.forEach((option, i) => {
      if (typeof option === 'string') {
        results.push(scanOne(option, opts, `${prefix}options[${i}]`, false))
        return
      }
      if (option === null || typeof option !== 'object') return
      for (const field of OPTION_TEXT_FIELDS) {
        if (typeof option[field] === 'string') results.push(scanOne(option[field], opts, `${prefix}options[${i}].${field}`, false))
      }
    })
  }
  return merge(results)
}

/**
 * Scan one card (an item as the pipeline shows it, or one question of a `{questions: [...]}` payload).
 * Scans CARD_TEXT_FIELDS and options[].(label | description | effect) only.
 * Always strict: pass the user's words as `opts.userText` for their quotes to be skipped.
 * @param {object} card
 * @param {object} [opts] - see scanText (quoteCues is refused)
 * @param {string} [prefix] - field-path prefix, e.g. 'questions[0].'
 */
export function scanCard(card, opts = {}, prefix = '') {
  strictOnly(opts, 'scanCard')
  return scanCardFields(card, opts, prefix)
}

/**
 * Scan whatever is about to be shown: a single card, or a payload `{questions: [...]}`. Always strict, like scanCard.
 */
export function scanPayload(payload, opts = {}) {
  strictOnly(opts, 'scanPayload')
  if (payload !== null && typeof payload === 'object' && Array.isArray(payload.questions)) {
    return merge(payload.questions.map((q, i) => scanCardFields(q, opts, `questions[${i}].`)))
  }
  return scanCardFields(payload, opts, '')
}

function walkStrings(value, opts, path) {
  if (typeof value === 'string') return scanOne(value, opts, path, false)
  if (Array.isArray(value)) return merge(value.map((v, i) => walkStrings(v, opts, `${path}[${i}]`)))
  if (value !== null && typeof value === 'object') {
    return merge(Object.entries(value).map(([k, v]) => walkStrings(v, opts, path ? `${path}.${k}` : k)))
  }
  return empty()
}

/**
 * Scan every string value of a UI dictionary or template-text object (keys are not scanned).
 * Always strict, like scanCard.
 */
export function scanStrings(value, opts = {}, path = '') {
  strictOnly(opts, 'scanStrings')
  return walkStrings(value, opts, path)
}

/**
 * The message the app sends back to the model when what it wrote for the user is rejected.
 * Addressed to the model (it may name internal words); never shown to the user.
 */
export function formatForAgent(result) {
  if (result.ok) return ''
  const lines = [`这段话里有 ${result.hits.length} 处用户不该看到的内部用词，请按对用户说话的词表改写后重来：`]
  for (const hit of result.hits) {
    const where = hit.field ? `${hit.field} 第 ${hit.line} 行` : `第 ${hit.line} 行`
    const variant = hit.normalized && hit.normalized !== hit.text ? `（按「${hit.normalized}」认出）` : ''
    lines.push(`- ${where}：「${showInvisible(hit.text)}」${variant}→ ${hit.suggestion ?? '换成对用户的说法'}（${showInvisible(hit.context)}）`)
  }
  lines.push('用户的原话要一字不差地照抄，放进「」或 > 引用块：应用会拿它和用户写过的话逐字核对，对不上的都算你的用词。文章标题用《》。别把你自己的话放进引号或引用块。')
  return lines.join('\n')
}
