// The matching view of a text (修补单 01 · Wb3): what a reader sees, with the ways of
// writing the same word folded together, so a banned term cannot slip through as a variant.
//
//  - NFKC, one character at a time: full-width letters, digits and punctuation → ASCII
//    (ａｒｇｕｍｅｎｔ → argument), ideographic space → space, compatibility ideographs →
//    unified ones. Kept as they are: circled numbers (式⑧ is a rule of its own), superscripts
//    and subscripts (H₂ is hydrogen, not hypothesis 2), vulgar fractions.
//  - invisible characters dropped: zero-width space / joiners, word joiner, soft hyphen, BOM,
//    bidi marks (Unicode Cf), variation selectors, combining grapheme joiner.
//  - blank-looking fillers (U+115F, U+1160, U+3164, U+FFA0, U+2800) read as a space.
//  - whitespace between two Han characters dropped (预 注 册 → 预注册), including one line
//    break (markdown joins such lines), but not a paragraph break.
//  - traditional → simplified for the characters of the banned terms and their exceptions
//    (banned-terms.json › normalize.traditional; the caller passes the map).
//
// Every UTF-16 unit of the view remembers the span of the source it came from, so a hit
// found in the view is reported where it sits in the original text.

const INVISIBLE = /[\p{Cf}\u034F\u17B4\u17B5\u180B-\u180D\u180F\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u
const BLANK = /[\u115F\u1160\u2800\u3164\uFFA0]/u
const KEEP = /[\u00AA\u00B2\u00B3\u00B9\u00BA\u00BC-\u00BE\u2070-\u209F\u2150-\u215F\u2189\u2460-\u24FF\u3200-\u32FF]/u
// Hyphens and the en dash read as '-' (A–级, Tier‑2; W3-2). The em dash and the horizontal bar are
// left alone: in Chinese they are sentence punctuation (方案A——优先), not a grade or a range.
const DASH = /[\u2010-\u2013\u02D7\u2796]/u
const HAN = /\p{Script=Han}/u
const SPACE = /\s/u
const LINE_BREAKS = { '\n': 1, '\u2028': 1, '\u2029': 2 }

/**
 * Build the matching view of `text`.
 * @param {string} text
 * @param {Record<string, string>} [traditional] - one character → one character
 * @returns {{text: string, from: number[], to: number[]}} `from[i]` / `to[i]`: the source span
 *   (UTF-16 offsets into `text`) of view unit i. A view span [a, b) comes from source [from[a], to[b - 1]).
 */
export function buildView(text, traditional = {}) {
  // 1. character by character
  const chars = []
  let at = 0
  for (const cp of text) {
    const start = at
    at += cp.length
    if (INVISIBLE.test(cp)) continue
    const out = BLANK.test(cp) ? ' ' : KEEP.test(cp) ? cp : cp.normalize('NFKC')
    for (const c of out) chars.push([traditional[c] ?? (DASH.test(c) ? '-' : c), start, at])
  }

  // 1b. the '>' markers of a line that carries on a quote block (the line before is quoted too), at any
  // depth, with or without a space: they count as part of the line break, so 对接 / 窗口 split over two
  // quoted lines join like any line break would (W3-2 review). A blank quoted line ('>') still makes two
  // line breaks — a paragraph break — and a quoted line after an unquoted one is a new block.
  const soft = new Uint8Array(chars.length)
  let prevQuoted = false
  for (let i = 0; i < chars.length;) {
    let end = i
    while (end < chars.length && chars[end][0] !== '\n') end++
    let k = i
    while (k < end && k - i < 3 && (chars[k][0] === ' ' || chars[k][0] === '\t')) k++
    let markers = -1
    while (k < end && chars[k][0] === '>') {
      k++
      if (k < end && (chars[k][0] === ' ' || chars[k][0] === '\t')) k++
      markers = k
    }
    if (markers !== -1 && prevQuoted) soft.fill(1, i, markers)
    prevQuoted = markers !== -1
    i = end + 1
  }
  const blank = idx => soft[idx] === 1 || SPACE.test(chars[idx][0])

  // 2. whitespace between two Han characters (at most one line break)
  const kept = []
  for (let i = 0; i < chars.length;) {
    if (!blank(i)) {
      kept.push(chars[i])
      i++
      continue
    }
    let j = i
    let breaks = 0
    while (j < chars.length && blank(j)) breaks += LINE_BREAKS[chars[j++][0]] ?? 0
    const before = kept.length ? kept[kept.length - 1][0] : ''
    const after = j < chars.length ? chars[j][0] : ''
    if (!(breaks < 2 && HAN.test(before) && HAN.test(after))) kept.push(...chars.slice(i, j))
    i = j
  }

  // 3. one string, one source span per UTF-16 unit
  let view = ''
  const from = []
  const to = []
  for (const [c, start, end] of kept) {
    view += c
    for (let k = 0; k < c.length; k++) {
      from.push(start)
      to.push(end)
    }
  }
  return { text: view, from, to }
}

/**
 * The view with all whitespace removed: what two texts are compared on
 * (a quote against the user's words, a hit against the allow list).
 */
export function flatten(text, traditional = {}) {
  return buildView(text, traditional).text.replace(/\s+/gu, '')
}

const ALNUM = /[A-Za-z0-9]/

/**
 * The form a quote is compared in (W3-2): the matching view, with whitespace dropped except one
 * space between two ASCII letters or digits. Spacing and line wraps do not matter; English words
 * stay apart, so a quote can be checked for cutting through one.
 */
export function quoteKey(text, traditional = {}) {
  return buildView(text, traditional).text.replace(/\s+/gu, (run, at, all) =>
    (ALNUM.test(all[at - 1] ?? '') && ALNUM.test(all[at + run.length] ?? '') ? ' ' : ''))
}

/**
 * Is `needle` (a quoteKey) in `hay` (a quoteKey) as whole words? Where the needle starts or ends
 * with an ASCII letter or digit, the user's text must not go on with one there: 「scope」 is not in
 * "the scoped review". Chinese has no word gaps, so a Chinese quote only has to be a substring.
 */
export function containsQuote(hay, needle) {
  if (!needle) return false
  const first = ALNUM.test(needle[0])
  const last = ALNUM.test(needle[needle.length - 1])
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
    if (first && at > 0 && ALNUM.test(hay[at - 1])) continue
    const after = at + needle.length
    if (last && after < hay.length && ALNUM.test(hay[after])) continue
    return true
  }
  return false
}

/** Show invisible and blank-looking characters as ⟨U+200B⟩ (for the message back to the agent). */
export function showInvisible(text) {
  let out = ''
  for (const cp of text) {
    out += INVISIBLE.test(cp) || BLANK.test(cp)
      ? `⟨U+${cp.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}⟩`
      : cp
  }
  return out
}
