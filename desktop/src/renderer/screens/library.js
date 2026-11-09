// v2 package F: the 资料库 tab of a library's page (screens/library-frame.js; design P5): its actions in the library's head, the
// list / graph switch (ViewSwitch) on its heading line; otherwise as v1.0 had it.
// v2 package H (design P5, UC4; docs/desktop.md §4.9): with nothing kept yet the page opens on 「抓到的」 (else 「已收藏」); the
// head has buttons only for the item being read — none while nothing is chosen (the reader says 「在左边选一条来读」). A note:
// 编辑 · 打开原文 · 更多 (用 Obsidian 打开 · 在资源管理器中显示 · 在浏览器里打开). A caught item, which has no file: 收藏 (only
// what waits in 待看: keepItem, the core's keep → writeNoteFile) · 打开原文 · 更多 (在浏览器里打开) — never Obsidian or the file
// manager. Kept from here → the page goes to 「已收藏」 with that note open, marked 「已收藏 · 进了 notes/」. 「打开原文」 is
// openReader(url, 'reader'): the isolated reading window (src/main/reader.mjs). A caught item that waits in 待看 shows its
// summary (getInbox). Hooks: [data-part="item-actions"][data-for=note|caught], [data-action=keep|more][data-items],
// the menu's [data-menu-item=obsidian|folder|browser], [data-kept-now], [data-part=pick-one|summary|keep-only-inbox].
// 资料库与阅读 (mockup S6; docs/desktop.md §4.2). Three columns: the list (the search box on top, four tabs with their
// counts, the topic and 「最近 30 天」 filters) · the reader (the note's Markdown cut into elements by lib/markdown.js;
// a [[link]] that names a note in the library opens it) · the right panel (this note: topics, source, the scores with
// their reasons, freshness, the file; the notes that link here; the notes from the same source). The top bar: 「编辑」
// (screens/edit-dialog.js), 「用 Obsidian 打开」, 「打开原文」. 「抓到的」 lists what the core's ledger holds short of kept or
// let go, with each step's score and the step it stopped at; 「待规范」 (mockup S8, docs/desktop.md §4.3) lists the files
// and their problems on the left and, in the reader, one card per file: the problem, the header the core proposes in a
// text box the user may change (lib/header-text.js), 「写入这一个」「跳过」, and 「全部按拟的写入」 on top. A file whose
// name cannot be an id, or for which no header can be proposed, says what to do instead and has no write button; the
// sub folders that are not read are named. 「跳过」 writes nothing and only hides the card until the page is opened again.
// Data only through the bridge (getLibrary, searchLibrary, readNote, getSources for the topics, getInbox, keepItem,
// openInObsidian, showNoteInFolder, openReader, applyHeader, applyAllHeaders); read again on `library-changed`. The page counts
// nothing: the tab counts are getLibrary().counts.
// Test hooks: main[data-screen="library"][data-state], [data-view=<id>][data-count][aria-current], [data-filter-topic=<name>],
// [data-filter-days], input[data-field="search"], [data-part=list|reader|note-panel|backlinks|same-source],
// [data-row=<id | url | file>][data-current], [data-reader=<id>], [data-panel-row=<key>],
// [data-action=edit|source|keep|more|verdicts|caught-verdicts], [data-stopped=<step>], [data-score=<node>];
// 待规范: [data-part=tidy|skipped-dirs|apply-all-result|written|skipped-line], [data-card=<file>][data-name-ok][data-proposable]
// with textarea[data-field="header"], [data-card-error], [data-card-why], [data-action=apply|skip|apply-all|show-skipped].
import { html, useEffect, useMemo, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { renderMarkdown } from '../lib/markdown.js'
import { headerText, parseHeaderText } from '../lib/header-text.js'
import { Icon, LinkButton, Menu, Panel, Tag, TopBar } from '../kit/index.js'
import { ERRORS, NODE_NAMES, NOTE_STATUS, SEP } from '../texts/common.js'
import { LIBRARY as T } from '../texts/library.js'
import { EditDialog } from './edit-dialog.js'
import { VerdictDialog } from './verdict-dialog.js'
import { LibraryFrame, ViewSwitch } from './library-frame.js'

const VIEWS = ['kept', 'authored', 'caught', 'pending']
const RECENT_DAYS = 30
const SEARCH_DELAY_MS = 250
const SCORE_ORDER = ['relevance', 'substance', 'freshness']

const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)
const isWeb = u => typeof u === 'string' && /^https?:\/\//i.test(u)
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : null)

/** A score as the index or the ledger holds it: a number, an enum value, or { score | value, reason }. */
export function scoreParts(v) {
  if (v && typeof v === 'object') return { value: num(v.score) ?? (typeof v.value === 'string' ? v.value : null), raw: v.score ?? v.value ?? null, reason: typeof v.reason === 'string' ? v.reason : '' }
  if (typeof v === 'number') return { value: num(v), raw: v, reason: '' }
  if (typeof v === 'string') return { value: v, raw: v, reason: '' }
  return { value: null, raw: null, reason: '' }
}

const scoreKeys = scores => {
  const keys = Object.keys(scores ?? {})
  return [...SCORE_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !SCORE_ORDER.includes(k))]
}

function pendingWords(code) {
  const c = String(code ?? '')
  if (Object.hasOwn(T.pending.codes, c)) return T.pending.codes[c]
  if (c.startsWith('missing:')) return fmt(T.pending.missing, { field: c.slice(8) })
  if (c.startsWith('bad-date:')) return fmt(T.pending.badDate, { field: c.slice(9) })
  return fmt(T.pending.other, { code: c })
}

function ViewTabs({ view, counts, onSelect }) {
  return html`<nav class="lib-views" aria-label=${T.viewsLabel}>
    ${VIEWS.map(id => html`<button key=${id} type="button" class="lib-views__tab" data-view=${id} data-count=${counts?.[id] ?? ''}
      aria-current=${id === view ? 'true' : undefined} onClick=${() => onSelect(id)}>${fmt(T.viewCount, { name: T.views[id], n: counts?.[id] ?? '' })}</button>`)}
  </nav>`
}

function Filters({ topics, chosen, days, onTopic, onDays }) {
  return html`<div class="lib-filters" role="group" aria-label=${T.filtersLabel}>
    ${topics.map(t => html`<button key=${t} type="button" class="lib-chip" data-filter-topic=${t} aria-pressed=${String(chosen.includes(t))} onClick=${() => onTopic(t)}>${t}</button>`)}
    <button type="button" class="lib-chip" data-filter-days=${RECENT_DAYS} aria-pressed=${String(days === RECENT_DAYS)} onClick=${onDays}>${T.recent}</button>
  </div>`
}

function NoteRow({ item, current, onSelect }) {
  const authored = item.status === 'authored'
  return html`<li class=${`lib-row${current ? ' lib-row--current' : ''}`} data-row=${item.id} data-current=${String(current)} data-status=${item.status ?? ''}>
    <a href="#" class="lib-row__link" aria-current=${current ? 'true' : undefined} onClick=${e => { e.preventDefault(); onSelect(item.id) }}>
      <span class="lib-row__title">${item.title}</span>
      <span class="lib-row__meta st-t-small st-t-sub">${authored ? fmt(T.row.authoredMeta, { date: item.date ?? '' }) : fmt(T.row.meta, { date: item.date ?? '', source: item.source_name ?? '' })}</span>
      ${item.snippet ? html`<span class="lib-row__snippet st-t-small st-t-muted" data-snippet>${item.snippet}</span>` : null}
    </a>
  </li>`
}

function stoppedWords(step) {
  if (Object.hasOwn(T.caught.stopped, step)) return T.caught.stopped[step]
  return fmt(T.caught.stoppedOther, { step: nodeName(step) })
}

function ScoreChips({ scores }) {
  return html`<span class="lib-scores">
    ${scoreKeys(scores).map(k => {
      const p = scoreParts(scores[k])
      if (p.value === null) return null
      const value = k === 'freshness' && Object.hasOwn(T.panel.freshness, p.value) ? T.panel.freshness[p.value] : p.value
      return html`<span key=${k} class="lib-score st-t-small" data-score=${k} data-value=${String(p.raw)}>${fmt(T.caught.score, { name: nodeName(k), score: value })}</span>`
    })}
  </span>`
}

function CaughtRow({ item, current, onSelect }) {
  return html`<li class=${`lib-row${current ? ' lib-row--current' : ''}`} data-row=${item.url} data-current=${String(current)} data-stopped=${item.stoppedAt ?? ''}>
    <a href="#" class="lib-row__link" aria-current=${current ? 'true' : undefined} onClick=${e => { e.preventDefault(); onSelect(item.url) }}>
      <span class="lib-row__title">${item.title}</span>
      <span class="lib-row__meta st-t-small st-t-sub">${[item.source ?? '', fmt(T.caught.firstSeen, { date: (item.firstSeen ?? '').slice(0, 10) })].join(SEP)}</span>
      <${ScoreChips} scores=${item.scores} />
      <span class="lib-row__stopped st-t-small st-t-wait">${stoppedWords(item.stoppedAt)}</span>
    </a>
  </li>`
}

function PendingRow({ item }) {
  const codes = Array.isArray(item.codes) ? item.codes : []
  return html`<li class="lib-row lib-row--static" data-row=${item.file}>
    <span class="lib-row__title">${item.file}</span>
    <span class="lib-row__meta st-t-small st-t-wait">${codes.map(pendingWords).join(SEP)}</span>
  </li>`
}

/** The text box's first text for a file: its proposed header, the date marked when it was taken from the file's mtime. */
function proposedText(item) {
  const codes = Array.isArray(item.codes) ? item.codes : []
  const dated = codes.includes('no-frontmatter') || codes.includes('missing:date')
  return headerText(item.proposedHeader, { comments: dated ? { date: T.pending.dateComment } : {} })
}

function TidyCard({ item, busy, onApply, onSkip }) {
  const initial = useMemo(() => (item.proposedHeader ? proposedText(item) : ''), [item.file, item.bodyHash, JSON.stringify(item.proposedHeader ?? null)])
  const [text, setText] = useState(initial)
  const [error, setError] = useState(null)
  const [writing, setWriting] = useState(false)
  useEffect(() => { setText(initial); setError(null) }, [initial])
  const codes = Array.isArray(item.codes) ? item.codes : []
  const id = `tidy-${item.file.replace(/[^A-Za-z0-9_-]/g, c => c.charCodeAt(0).toString(16))}`
  const proposable = Boolean(item.proposedHeader) && item.nameOk !== false
  const write = async () => {
    setError(null)
    let header = null
    if (text !== initial) {
      const r = parseHeaderText(text)
      if (!r.ok) { setError(fmt(T.pending.parseFailed, { line: r.line })); return }
      header = r.header
    }
    setWriting(true)
    try { await onApply(item.file, header) } catch (err) { setError(err?.code === 'bad_arguments' ? T.pending.failed : T.pending.failedOther) } finally { setWriting(false) }
  }
  let why = null
  if (item.nameOk === false) why = fmt(T.pending.badName, { name: item.file.replace(/\.md$/i, '') })
  else if (!item.proposedHeader) why = fmt(T.pending.notProposable, { problems: codes.map(pendingWords).join(SEP) })
  return html`<article class="lib-card" data-card=${item.file} data-name-ok=${String(item.nameOk !== false)} data-proposable=${String(proposable)} aria-labelledby=${`${id}-file`}>
    <div class="lib-card__head">
      <h3 class="lib-card__file" id=${`${id}-file`}>${item.file}</h3>
      <span class="st-t-small st-t-wait">${codes.map(pendingWords).join(SEP)}</span>
    </div>
    ${why ? html`<p class="lib-card__why st-t-small" data-card-why>${why}</p>` : html`
      <label class="st-t-small st-t-sub" for=${`${id}-header`}>${T.pending.headerLabel}</label>
      <textarea id=${`${id}-header`} class="lib-card__header" data-field="header" rows=${Math.max(4, text.split('\n').length + 1)} spellcheck=${false}
        value=${text} onInput=${e => setText(e.currentTarget.value)}></textarea>`}
    ${error ? html`<p class="lib-error st-t-small" role="alert" data-card-error>${error}</p>` : null}
    <div class="lib-card__actions">
      ${proposable ? html`<${Act} name="apply" variant="primary" disabled=${busy || writing} onClick=${write}>${writing ? T.pending.applying : T.pending.apply}<//>` : null}
      <${Act} name="skip" disabled=${writing} onClick=${() => onSkip(item.file)}>${T.pending.skip}<//>
    </div>
  </article>`
}

/** 待规范 (S8): the cards, 「全部按拟的写入」, what was written, what was skipped, the sub folders not read. */
function TidyCards({ items, skippedDirs }) {
  const [skipped, setSkipped] = useState([])
  const [showSkipped, setShowSkipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [allResult, setAllResult] = useState(null)
  const [allError, setAllError] = useState(null)
  const shown = items.filter(it => showSkipped || !skipped.includes(it.file))
  const skippedHere = items.filter(it => skipped.includes(it.file)).length
  const proposable = items.filter(it => it.proposedHeader && it.nameOk !== false)
  const apply = async (file, header) => {
    setDone(null)
    const r = await call('applyHeader', file, header)
    setDone({ file: r.file, view: r.entry?.status === 'kept' ? T.views.kept : T.views.authored })
  }
  const applyAll = async () => {
    setBusy(true)
    setDone(null)
    setAllResult(null)
    setAllError(null)
    try { setAllResult(await call('applyAllHeaders')) } catch { setAllError(T.pending.failedOther) } finally { setBusy(false) }
  }
  return html`<section class="lib-tidy" data-part="tidy" aria-labelledby="lib-tidy-title">
    <div class="lib-tidy__head">
      <h2 class="st-t-heading" id="lib-tidy-title">${items.length ? fmt(T.pending.heading, { n: items.length }) : T.empty.pending}</h2>
      ${items.length ? html`<${Act} name="apply-all" disabled=${busy || proposable.length === 0} onClick=${applyAll}>${busy ? T.pending.applyingAll : T.pending.applyAll}<//>` : null}
    </div>
    <p class="st-t-small st-t-sub">${T.pending.note}</p>
    ${skippedDirs.length ? html`<p class="lib-tidy__dirs st-t-small" data-part="skipped-dirs" data-dirs=${skippedDirs.join('\n')}>${fmt(T.pending.subfolders, { dirs: skippedDirs.join(SEP) })}</p>` : null}
    ${done ? html`<p class="st-t-small st-t-done" role="status" data-part="written" data-file=${done.file}>${fmt(T.pending.written, { file: done.file, view: done.view })}</p>` : null}
    ${allResult ? html`<p class="st-t-small" role="status" data-part="apply-all-result" data-written=${allResult.written.length} data-left=${allResult.skipped.length}>
      <span class="st-t-done">${fmt(T.pending.allWritten, { n: allResult.written.length })}</span>
      ${allResult.skipped.length ? html` <span class="st-t-wait">${fmt(T.pending.allLeft, { n: allResult.skipped.length, files: allResult.skipped.map(x => x.file).join(SEP) })}</span>` : null}
    </p>` : null}
    ${allError ? html`<p class="lib-error st-t-small" role="alert">${allError}</p>` : null}
    ${shown.map(it => html`<${TidyCard} key=${it.file} item=${it} busy=${busy} onApply=${apply} onSkip=${f => setSkipped(list => (list.includes(f) ? list : [...list, f]))} />`)}
    ${skippedHere && !showSkipped ? html`<p class="st-t-small st-t-sub" data-part="skipped-line" data-count=${skippedHere}>${fmt(T.pending.skippedLine, { n: skippedHere })}
      <${LinkButton} onClick=${() => setShowSkipped(true)}>${T.pending.showSkipped}<//></p>` : null}
  </section>`
}

function Reader({ note, resolve, onWiki, keptNow }) {
  const e = note.entry ?? {}
  const meta = [
    e.source ? fmt(T.reader.source, { source: e.source }) : null,
    e.date ? fmt(T.reader.date, { date: e.date }) : null,
    e.kept ? fmt(T.reader.kept, { date: e.kept }) : null,
  ].filter(Boolean)
  return html`<article class="lib-reader__note" data-reader=${e.id}>
    <div class="lib-reader__status" data-kept-now=${String(keptNow === true)}>
      <${Tag} tone=${e.status === 'authored' ? 'recommend' : 'done'}>${keptNow ? T.reader.keptNow : NOTE_STATUS[e.status] ?? e.status ?? ''}<//>
    </div>
    <h2 class="lib-reader__title st-t-heading">${e.title}</h2>
    <div class="lib-reader__meta st-t-small st-t-sub">${meta.join(SEP)}</div>
    <div class="lib-reader__body md" data-part="body">${renderMarkdown(note.body ?? '', { resolve, onWiki, missingTitle: T.reader.missingLink })}</div>
  </article>`
}

/** A caught item waits in 待看 (the core's stoppedAt 'inbox'): only such an item can be kept (the core's keep). */
const inInbox = item => item?.stoppedAt === 'inbox' || item?.stage === 'inbox'

function CaughtReader({ item, card, onVerdicts }) {
  const summary = card?.summary ?? null
  const points = Array.isArray(summary?.points) ? summary.points.filter(p => typeof p === 'string' && p) : []
  return html`<article class="lib-reader__note" data-reader=${item.url}>
    <div class="lib-reader__status"><${Tag} tone="wait">${inInbox(item) ? fmt(T.caught.inInbox, { caught: T.views.caught }) : T.views.caught}<//></div>
    <h2 class="lib-reader__title st-t-heading">${item.title}</h2>
    <div class="lib-reader__meta st-t-small st-t-sub">${[fmt(T.caught.source, { source: item.source ?? '', date: item.date ?? '' }), fmt(T.caught.firstSeen, { date: (item.firstSeen ?? '').slice(0, 10) })].join(SEP)}</div>
    ${summary?.what ? html`<p class="lib-reader__what" data-part="summary"><b>${T.reader.what}</b>${summary.what}</p>` : null}
    ${points.length ? html`<ul class="lib-reader__points">${points.map((p, i) => html`<li key=${i}>${p}</li>`)}</ul>` : null}
    ${inInbox(item) ? null : html`<p class="st-t-small st-t-wait" data-part="keep-only-inbox">${T.actions.keepOnlyInbox}</p>`}
    <dl class="lib-kv">
      ${scoreKeys(item.scores).map(k => {
        const p = scoreParts(item.scores[k])
        const value = k === 'freshness' && Object.hasOwn(T.panel.freshness, p.value) ? T.panel.freshness[p.value] : p.value
        return html`<div key=${k} class="lib-kv__row" data-score=${k}><dt>${nodeName(k)}</dt><dd>${p.reason ? fmt(T.panel.score, { score: value ?? '', reason: p.reason }) : value ?? ''}</dd></div>`
      })}
      <div class="lib-kv__row" data-stopped=${item.stoppedAt ?? ''}><dt>${T.panel.status}</dt><dd class="st-t-wait">${stoppedWords(item.stoppedAt)}</dd></div>
    </dl>
    <p class="st-t-small st-t-sub">${T.caught.note}</p>
    <div><${Act} name="caught-verdicts" onClick=${onVerdicts}>${T.panel.verdicts}<//></div>
  </article>`
}

function NotePanel({ note, onSelect, onVerdicts }) {
  if (!note) return html`<div class="lib-panel" data-part="note-panel"><p class="st-t-small st-t-muted">${T.panel.none}</p></div>`
  const e = note.entry ?? {}
  const scores = e.scores ?? {}
  const reasons = note.scores ?? note.meta?.scores ?? {}
  const backlinks = Array.isArray(note.backlinks) ? note.backlinks : []
  const same = Array.isArray(note.sameSource) ? note.sameSource : []
  return html`<div class="lib-panel" data-part="note-panel" data-id=${e.id}>
    <section class="lib-panel__block" aria-labelledby="lib-panel-title">
      <h2 class="st-t-small st-t-sub st-t-strong" id="lib-panel-title">${T.panel.title}</h2>
      <dl class="lib-kv">
        <div class="lib-kv__row" data-panel-row="topics"><dt>${T.panel.topics}</dt><dd>${(e.topics ?? []).join(SEP)}</dd></div>
        <div class="lib-kv__row" data-panel-row="source"><dt>${T.panel.source}</dt><dd>${e.source_name ?? e.source ?? ''}</dd></div>
        ${scoreKeys(scores).map(k => {
          const p = scoreParts(reasons[k] ?? scores[k])
          if (!p.reason) p.reason = scoreParts(scores[k]).reason
          const value = k === 'freshness' && Object.hasOwn(T.panel.freshness, p.value) ? T.panel.freshness[p.value] : p.value
          return html`<div key=${k} class="lib-kv__row" data-panel-row=${k}><dt>${nodeName(k)}</dt><dd>${p.reason ? fmt(T.panel.score, { score: value ?? '', reason: p.reason }) : value ?? ''}</dd></div>`
        })}
        <div class="lib-kv__row" data-panel-row="file"><dt>${T.panel.file}</dt><dd class="lib-kv__file">${note.file ?? ''}</dd></div>
      </dl>
      ${e.status === 'kept' && isWeb(e.source) ? html`<div><${Act} name="verdicts" onClick=${onVerdicts}>${T.panel.verdicts}<//></div>` : null}
    </section>
    <section class="lib-panel__block" data-part="backlinks" aria-labelledby="lib-backlinks">
      <h2 class="st-t-small st-t-sub st-t-strong" id="lib-backlinks">${T.panel.backlinks}</h2>
      ${backlinks.length ? html`<ul class="lib-panel__list">${backlinks.map(b => html`<li key=${b.id} data-link=${b.id}><${LinkButton} onClick=${() => onSelect(b.id)}>${b.title}<//></li>`)}</ul>`
        : html`<p class="st-t-small st-t-muted">${T.panel.backlinksNone}</p>`}
    </section>
    <section class="lib-panel__block" data-part="same-source" aria-labelledby="lib-same">
      <h2 class="st-t-small st-t-sub st-t-strong" id="lib-same">${T.panel.sameSource}</h2>
      ${same.length ? html`<ul class="lib-panel__list">${same.map(b => html`<li key=${b.id} data-link=${b.id}><${LinkButton} onClick=${() => onSelect(b.id)}>${fmt(T.panel.sameSourceLine, { title: b.title, date: b.date ?? '' })}<//></li>`)}</ul>`
        : html`<p class="st-t-small st-t-muted">${T.panel.sameSourceNone}</p>`}
    </section>
  </div>`
}

/** 「更多」: a button, and under it a menu of `items` ([{ id, label }]); a choice calls onSelect(id). */
function MoreMenu({ items, onSelect }) {
  const button = useRef(null)
  const [at, setAt] = useState(null)
  const open = () => {
    const r = button.current?.getBoundingClientRect()
    if (r) setAt({ x: r.left, y: r.bottom + 4 })
  }
  return html`<span class="st-act lib-more" data-action="more" data-items=${items.map(i => i.id).join(' ')}>
    <button type="button" class="st-button" ref=${button} aria-haspopup="menu" aria-expanded=${String(at !== null)} onClick=${open}>
      ${T.actions.more}<${Icon} name="chevron-down" />
    </button>
    ${at ? html`<${Menu} label=${T.actions.moreLabel} x=${at.x} y=${at.y} items=${items}
      onSelect=${id => { setAt(null); onSelect(id) }}
      onClose=${({ restoreFocus }) => { setAt(null); if (restoreFocus) button.current?.focus() }} />` : null}
  </span>`
}

export function LibraryScreen({ params = {} }) {
  const { navigate } = useApp()
  // the tab: the one a navigation names; else, once the counts are known, 已收藏 — or 抓到的 when nothing is kept yet
  // (v2 package H, design UC4 step 1). Until then no tab is current.
  const [chosenView, setView] = useState(VIEWS.includes(params.view) ? params.view : null)
  const [topics, setTopics] = useState([])
  const [days, setDays] = useState(null)
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(typeof params.id === 'string' ? params.id : null)
  const [caughtUrl, setCaughtUrl] = useState(null)
  const [editing, setEditing] = useState(false)
  const [verdictsFor, setVerdictsFor] = useState(null)
  const [actionError, setActionError] = useState(null)
  // v2 package H: 「收藏」 from 抓到的 (the core's keep, as 待看's C does); the note it made, marked 「已收藏 · 进了 notes/」
  const [keeping, setKeeping] = useState(false)
  const [keptNow, setKeptNow] = useState(null)
  const topicsKey = topics.join('\n')
  const filter = { topics, days }

  const lib = useLoad(async () => {
    if (chosenView) return call('getLibrary', chosenView, filter)
    const first = await call('getLibrary', 'kept', filter)
    return first?.counts?.kept === 0 ? call('getLibrary', 'caught', filter) : first
  }, [chosenView, topicsKey, days])
  // (a reload decides again; only a keep turns 0 kept into 1, and a keep from this page picks 已收藏 itself)
  const view = chosenView ?? (VIEWS.includes(lib.data?.view) ? lib.data.view : null)
  // what 待看 holds, for a caught item's summary (getInbox: the same cards as the 待看 tab)
  const inbox = useLoad(() => (view === 'caught' ? call('getInbox') : null), [view])
  const searchView = view === 'kept' || view === 'authored' ? view : 'all'
  const found = useLoad(() => (q ? call('searchLibrary', q, { view: searchView, topics, days }) : null), [q, searchView, topicsKey, days])
  const note = useLoad(() => (selected ? call('readNote', selected) : null), [selected])
  const sources = useLoad(() => call('getSources'), [])
  // every note's id and title, to say which note a [[link]] names (a lookup in the index, the core's resolution rule:
  // an exact id first, then an exact title)
  const names = useLoad(() => Promise.all([call('getLibrary', 'kept', { topics: [], days: null }), call('getLibrary', 'authored', { topics: [], days: null })]), [])
  useEvent('library-changed', () => { lib.reload(); found.reload(); note.reload(); names.reload(); sources.reload() })
  useEvent('inbox-changed', () => { if (view === 'caught') { lib.reload(); inbox.reload() } }, [view])

  // a navigation that names a note (the graph's 「打开」, an answer's source) opens it
  useEffect(() => { if (typeof params.id === 'string') { setSelected(params.id); setCaughtUrl(null) } }, [params.id])
  // the debounced search
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim().slice(0, 200)), SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [query])

  const items = lib.data?.items ?? []
  const counts = lib.data?.counts ?? null
  const results = q ? (Array.isArray(found.data) ? found.data : []) : null
  // nothing chosen yet: the first note of the list
  useEffect(() => {
    if (selected || results) return
    if ((view === 'kept' || view === 'authored') && items.length) setSelected(items[0].id)
  }, [lib.data, view])

  const byName = useMemo(() => {
    const map = new Map()
    for (const part of names.data ?? []) for (const it of part?.items ?? []) { if (!map.has(it.id)) map.set(it.id, it.id) }
    for (const part of names.data ?? []) for (const it of part?.items ?? []) { if (typeof it.title === 'string' && !map.has(it.title)) map.set(it.title, it.id) }
    return map
  }, [names.data])
  const resolve = target => byName.get(target) ?? null

  const choose = id => { setSelected(id); setCaughtUrl(null); setActionError(null) }
  const toggleTopic = t => setTopics(list => (list.includes(t) ? list.filter(x => x !== t) : [...list, t]))
  const toggleDays = () => setDays(d => (d === RECENT_DAYS ? null : RECENT_DAYS))
  const doCall = async (name, ...args) => {
    setActionError(null)
    try { await call(name, ...args) } catch { setActionError(T.actions.failed) }
  }
  const topicNames = (sources.data?.topics ?? []).map(t => t.name).filter(n => typeof n === 'string')

  const n = note.data
  const entry = n?.entry ?? null
  // what the reader and the panel show: a note (a search, 已收藏, 我写的), a caught item, or the files to tidy
  const mode = results ? 'note' : view === 'caught' ? 'caught' : view === 'pending' ? 'pending' : 'note'
  const caughtItem = mode === 'caught' && caughtUrl ? items.find(i => i.url === caughtUrl) ?? null : null
  const showNote = mode === 'note'

  let list
  if (results) {
    list = found.status === 'loading' && !found.data ? html`<p class="lib-list__note st-t-small st-t-muted">${T.searching}</p>`
      : results.length ? html`<ul class="lib-list__rows">${results.map(r => html`<${NoteRow} key=${r.id} item=${r} current=${r.id === selected && !caughtItem} onSelect=${choose} />`)}</ul>`
        : html`<p class="lib-list__note st-t-small st-t-muted" data-part="search-none">${T.searchNone}</p>`
  } else if (lib.status === 'error' && !lib.data) {
    list = html`<div class="lib-error" role="alert">${lib.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => lib.reload()}>${ERRORS.retry}<//></div>`
  } else if (lib.data && !items.length) {
    list = html`<p class="lib-list__note st-t-small st-t-muted" data-part="empty">${topics.length || days ? T.filteredEmpty : T.empty[view]}</p>`
  } else if (view === 'caught') {
    list = html`<ul class="lib-list__rows">${items.map(it => html`<${CaughtRow} key=${it.url} item=${it} current=${it.url === caughtUrl} onSelect=${url => { setCaughtUrl(url); setActionError(null) }} />`)}</ul>`
  } else if (view === 'pending') {
    list = html`<ul class="lib-list__rows">${items.map(it => html`<${PendingRow} key=${it.file} item=${it} />`)}</ul>`
  } else {
    list = html`<ul class="lib-list__rows">${items.map(it => html`<${NoteRow} key=${it.id} item=${it} current=${it.id === selected} onSelect=${choose} />`)}</ul>`
  }

  let reader
  const card = caughtItem ? (inbox.data?.items ?? []).find(c => c.url === caughtItem.url) ?? null : null
  if (caughtItem) reader = html`<${CaughtReader} item=${caughtItem} card=${card} onVerdicts=${() => setVerdictsFor({ url: caughtItem.url, title: caughtItem.title })} />`
  else if (mode === 'caught') reader = html`<p class="st-t-small st-t-muted" data-part="pick-one">${T.reader.none}</p>`
  // lib.data must be the pending view's own answer, not the list of the tab before (still shown while this one loads)
  else if (mode === 'pending') reader = lib.data?.view === 'pending' && (items.length || lib.data.skippedDirs?.length) ? html`<${TidyCards} items=${items} skippedDirs=${Array.isArray(lib.data.skippedDirs) ? lib.data.skippedDirs : []} />`
    : html`<p class="st-t-small st-t-muted">${T.pending.note}</p>`
  else if (n && selected) reader = html`<${Reader} note=${n} resolve=${resolve} onWiki=${choose} keptNow=${keptNow !== null && n.entry?.id === keptNow} />`
  else if (note.status === 'error') reader = html`<p class="lib-error" role="alert">${T.reader.loadFailed}</p>`
  else reader = html`<p class="st-t-small st-t-muted" data-part="pick-one">${T.reader.none}</p>`

  // the head's buttons (v2 package H, design P5 / UC4): only for the item being read. A note (a file in the library): 编辑,
  // 打开原文 (a web source), 更多 = 用 Obsidian 打开 · 在资源管理器中显示 · 在浏览器里打开. A caught item (no file yet): 收藏 (only
  // what waits in 待看; the core's keep, through writeNoteFile), 打开原文, 更多 = 在浏览器里打开 — no Obsidian, no file manager
  const openSource = url => doCall('openReader', url, 'reader')
  const keepCaught = async item => {
    setKeeping(true)
    setActionError(null)
    try {
      const r = await call('keepItem', item.url)
      setKeptNow(r.id)
      setCaughtUrl(null)
      setSelected(r.id)
      setView('kept')
    } catch { setActionError(T.actions.failed) } finally { setKeeping(false) }
  }
  const noteTarget = showNote && entry && selected && entry.id === selected ? entry : null
  let actions = null
  if (noteTarget) {
    const e = noteTarget
    const more = [{ id: 'obsidian', label: T.actions.obsidian }, { id: 'folder', label: T.actions.folder }, ...(isWeb(e.source) ? [{ id: 'browser', label: T.actions.browser }] : [])]
    const pick = id => {
      if (id === 'obsidian') doCall('openInObsidian', e.id)
      else if (id === 'folder') doCall('showNoteInFolder', e.id)
      else if (id === 'browser') doCall('openReader', e.source, 'browser')
    }
    actions = html`<div class="lib-actions" data-part="item-actions" data-for="note" data-id=${e.id}>
      <${Act} name="edit" onClick=${() => setEditing(true)}>${T.actions.edit}<//>
      ${isWeb(e.source) ? html`<${Act} name="source" icon="external" onClick=${() => openSource(e.source)}>${T.actions.source}<//>` : null}
      <${MoreMenu} items=${more} onSelect=${pick} />
    </div>`
  } else if (caughtItem) {
    const it = caughtItem
    actions = html`<div class="lib-actions" data-part="item-actions" data-for="caught" data-url=${it.url}>
      <${Act} name="keep" variant="primary" disabled=${keeping || !inInbox(it)} onClick=${() => keepCaught(it)}>${keeping ? T.actions.keeping : T.actions.keep}<//>
      ${isWeb(it.url) ? html`<${Act} name="source" icon="external" onClick=${() => openSource(it.url)}>${T.actions.source}<//>` : null}
      ${isWeb(it.url) ? html`<${MoreMenu} items=${[{ id: 'browser', label: T.actions.browser }]} onSelect=${() => doCall('openReader', it.url, 'browser')} />` : null}
    </div>`
  }
  const panel = html`<${Panel} label=${T.panel.title}>
    ${showNote ? html`<${NotePanel} note=${n} onSelect=${choose} onVerdicts=${() => setVerdictsFor({ url: entry.source, title: entry.title })} />` : html`<div class="lib-panel" data-part="note-panel"><p class="st-t-small st-t-muted">${T.panel.none}</p></div>`}
  <//>`
  const state = lib.data ? 'ready' : lib.status
  return html`<${LibraryFrame} tab="library" state=${state} labelledby="library-title" panel=${panel} actions=${actions}>
      <${TopBar} title=${T.title} titleTag="h2" titleId="library-title"
        subtitle=${showNote && entry ? NOTE_STATUS[entry.status] ?? '' : caughtItem ? T.views.caught : null}
        actions=${html`<${ViewSwitch} current="list" onSelect=${v => { if (v === 'graph') navigate('graph') }} />`} />
      <div class="st-main__body lib-body">
        <section class="lib-list" data-part="list" aria-label=${T.views[view]}>
          <div class="lib-list__head">
            <input type="search" class="lib-search" data-field="search" aria-label=${T.searchLabel} placeholder=${T.searchPlaceholder} maxlength="200"
              value=${query} onInput=${e => setQuery(e.currentTarget.value)} />
            <${ViewTabs} view=${view} counts=${counts} onSelect=${id => { setView(id); setCaughtUrl(null); setKeptNow(null); setQuery(''); setQ('') }} />
            <${Filters} topics=${topicNames} chosen=${topics} days=${days} onTopic=${toggleTopic} onDays=${toggleDays} />
            ${results ? html`<div class="st-t-small st-t-sub" data-part="search-count" data-count=${results.length}>${fmt(T.searchCount, { n: results.length })}</div>` : null}
          </div>
          <div class="lib-list__body">${list}</div>
        </section>
        <section class="lib-reader" data-part="reader" aria-label=${T.reader.label}>
          ${actionError ? html`<p class="lib-error" role="alert">${actionError}</p>` : null}
          ${reader}
        </section>
      </div>
    ${editing && n ? html`<${EditDialog} note=${n} topics=${topicNames} onClose=${() => setEditing(false)}
      onSaved=${() => { setEditing(false); note.reload(); lib.reload(); names.reload() }} />` : null}
    ${verdictsFor ? html`<${VerdictDialog} url=${verdictsFor.url} title=${verdictsFor.title} onClose=${() => setVerdictsFor(null)} />` : null}
  <//>`
}
