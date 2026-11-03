// A note's Markdown cut into Preact elements, never into an HTML string (the page's CSP and Trusted Types refuse
// innerHTML; text inserted with ${…} is always text). What it knows, and nothing more:
//   blocks   # headings (1–6) · paragraphs (a line break inside one stays a line break, as Obsidian shows it) ·
//            - / * / + lists · 1. lists · > quotes · ``` fenced code · --- rules
//   inline   **bold** / __bold__ · *italic* / _italic_ · `code` · [words](address) · [[target]] / [[target|words]] /
//            [[target#part]]
// An address is shown as words with the address in its tooltip, not followed: the page cannot leave app://ui/ (the
// shell's security baseline), and opening a source goes through the bridge (openItemUrl), not through the body.
//   renderMarkdown(text, { resolve, onWiki })
//     resolve(target) → the id of the note a [[target]] names, or null (unresolved: drawn as such, not clickable)
//     onWiki(id, target) → a resolved [[link]] was clicked
// Test hooks: [data-md=<block type>], [data-wiki=<target>][data-wiki-id] / [data-wiki-missing], [data-md-link].
// parseBlocks / parseInline are exported for anyone who needs the structure without drawing it.
import { html } from './html.js'

const FENCE = /^\s*```/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const UL = /^\s*[-*+]\s+(.*)$/
const OL = /^\s*(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const RULE = /^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$/

const startsBlock = line => FENCE.test(line) || HEADING.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line) || RULE.test(line)

/** The blocks of a text, in order: { type: 'heading', level, text } · { type: 'p', text } · { type: 'ul' | 'ol', items, start? } · { type: 'quote', text } · { type: 'code', text } · { type: 'hr' }. */
export function parseBlocks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }
    if (FENCE.test(line)) {
      const body = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++])
      i++ // the closing fence (or the end)
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    let m = HEADING.exec(line)
    if (m) { blocks.push({ type: 'heading', level: m[1].length, text: m[2] }); i++; continue }
    if (RULE.test(line)) { blocks.push({ type: 'hr' }); i++; continue }
    if (UL.test(line)) {
      const items = []
      while (i < lines.length && (m = UL.exec(lines[i]))) { items.push(m[1]); i++ }
      blocks.push({ type: 'ul', items })
      continue
    }
    if (OL.test(line)) {
      const items = []
      const start = Number(OL.exec(line)[1])
      while (i < lines.length && (m = OL.exec(lines[i]))) { items.push(m[2]); i++ }
      blocks.push({ type: 'ol', items, start })
      continue
    }
    if (QUOTE.test(line)) {
      const body = []
      while (i < lines.length && (m = QUOTE.exec(lines[i]))) { body.push(m[1]); i++ }
      blocks.push({ type: 'quote', text: body.join('\n') })
      continue
    }
    const body = []
    while (i < lines.length && lines[i].trim() !== '' && (body.length === 0 || !startsBlock(lines[i]))) body.push(lines[i++].trim())
    blocks.push({ type: 'p', text: body.join('\n') })
  }
  return blocks
}

// code · [[wiki]] · [words](address) · **bold** · __bold__ · *italic* · _italic_ (an underscore only between non-word
// characters, so snake_case words stay words)
const INLINE = /`([^`\n]+)`|\[\[([^[\]\n]+?)\]\]|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|\*([^*\n]+)\*|(?<![\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}_])/gu

/** The inline pieces of a text: { t: 'text', v } · { t: 'code', v } · { t: 'wiki', target, label } · { t: 'link', href, children } · { t: 'strong' | 'em', children }. */
export function parseInline(text) {
  const s = String(text ?? '')
  const out = []
  let last = 0
  for (const m of s.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'code', v: m[1] })
    else if (m[2] !== undefined) {
      const [ref, label] = m[2].split('|')
      const target = ref.split('#')[0].trim()
      out.push({ t: 'wiki', target, label: (label ?? ref).trim() || target })
    } else if (m[3] !== undefined) out.push({ t: 'link', href: m[4], children: parseInline(m[3]) })
    else if (m[5] !== undefined || m[6] !== undefined) out.push({ t: 'strong', children: parseInline(m[5] ?? m[6]) })
    else out.push({ t: 'em', children: parseInline(m[7] ?? m[8]) })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) })
  return out
}

function textWithBreaks(v, key) {
  const parts = v.split('\n')
  return parts.map((p, i) => (i === 0 ? p : html`<br key=${`${key}-br${i}`} />${p}`))
}

function inline(pieces, opts, key = 'i') {
  return pieces.map((p, i) => {
    const k = `${key}.${i}`
    if (p.t === 'text') return textWithBreaks(p.v, k)
    if (p.t === 'code') return html`<code key=${k} class="md-code">${p.v}</code>`
    if (p.t === 'strong') return html`<strong key=${k}>${inline(p.children, opts, k)}</strong>`
    if (p.t === 'em') return html`<em key=${k}>${inline(p.children, opts, k)}</em>`
    if (p.t === 'link') return html`<span key=${k} class="md-link" data-md-link=${p.href} title=${p.href}>${inline(p.children, opts, k)}</span>`
    const id = p.target && typeof opts.resolve === 'function' ? opts.resolve(p.target) : null
    if (!id) return html`<span key=${k} class="md-wiki md-wiki--missing" data-wiki=${p.target} data-wiki-missing title=${opts.missingTitle ?? null}>${p.label}</span>`
    return html`<a key=${k} href="#" class="md-wiki" data-wiki=${p.target} data-wiki-id=${id}
      onClick=${e => { e.preventDefault(); opts.onWiki?.(id, p.target) }}>${p.label}</a>`
  })
}

/**
 * @param {string} text - the note's body (Markdown)
 * @param {{ resolve?: (target: string) => string | null, onWiki?: (id: string, target: string) => void, missingTitle?: string }} [opts]
 */
export function renderMarkdown(text, opts = {}) {
  return parseBlocks(text).map((b, i) => {
    const k = `b${i}`
    if (b.type === 'heading') {
      const Tag = `h${Math.min(6, b.level + 1)}` // the note's # is below the reader's own title (h2)
      return html`<${Tag} key=${k} class=${`md-h md-h${b.level}`} data-md="heading" data-level=${b.level}>${inline(parseInline(b.text), opts, k)}<//>`
    }
    if (b.type === 'ul') return html`<ul key=${k} class="md-list" data-md="ul">${b.items.map((it, j) => html`<li key=${j}>${inline(parseInline(it), opts, `${k}.${j}`)}</li>`)}</ul>`
    if (b.type === 'ol') return html`<ol key=${k} class="md-list" data-md="ol" start=${b.start}>${b.items.map((it, j) => html`<li key=${j}>${inline(parseInline(it), opts, `${k}.${j}`)}</li>`)}</ol>`
    if (b.type === 'quote') return html`<blockquote key=${k} class="md-quote" data-md="quote">${inline(parseInline(b.text), opts, k)}</blockquote>`
    if (b.type === 'code') return html`<pre key=${k} class="md-pre" data-md="code"><code>${b.text}</code></pre>`
    if (b.type === 'hr') return html`<hr key=${k} class="md-hr" data-md="hr" />`
    return html`<p key=${k} class="md-p" data-md="p">${inline(parseInline(b.text), opts, k)}</p>`
  })
}
