// 资料库 — redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-1, R3-3, R3-4; design 03-页面稿 P09 · P11 · P12 and 07-模板版
// streams/app.js 「资料库」 · 「编辑笔记」 · 「缺少文件头」; F33–F39; 维护者 11-11 第 9 题), built on the template's parts.
// 资料库 only holds what is a file of the library (the index): no 「抓到的」 (R2 moved it to 待看's 未通过筛选), no 「待规范」 tab, no
// 「添加链接」 here (R2 put it in 待看).
//   The list (st-split › st-list): the head 「资料库」 + 列表 · 图谱 (ViewSwitch), the search (search-field; snippets without
//   Markdown marks: the core's search), the filters 全部 n · 已收藏 n · 我的笔记 n (getLibrary's counts: core libraryCounts all ·
//   kept · authored), the topics and 最近 30 天 (filters), then — only while the core lists such files (counts.pending > 0) — the
//   line 「n 个文件缺少文件头，尚未入库。  去处理」 (progress-alert), then the rows (source-card: 日期 · 来源, the title, a line of
//   the summary or the search's snippet). A note named by the route opens; else the first of the list.
//   The reading area (reader): on top the mark 已收藏 / 我的笔记 (status-chip) and 编辑 · 查看原文 · 更多 ▾ (在 Obsidian 中打开 ·
//   在资源管理器中显示 · 在浏览器中打开); 查看原文 opens Streams' reading window (openReader(url, 'reader')), the browser only from
//   「更多」 (and the reading window itself). Then the paper (reader-paper): 来源 / 主题, the title, 发布 · 收藏, the text (its
//   Markdown cut into elements by lib/markdown.js — 内容概述 is the text's own first paragraph; a [[link]] that names a note opens it).
//   The right panel's 详情 (only what the reading area has not; 1.1 W7b: no score of v1.0's scoring): 核验 with the folded 核验记录
//   (verdict-dialog.js VerdictFold, the component 待看 uses), 文件 (its path in the library folder), 反向链接, 同来源内容 (a click
//   selects that note here).
//   编辑 (screens/edit-dialog.js): the template's dialog; title, topics, body, insert link — nothing else (core editNote, V2).
//   缺少文件头 (route params.view 'pending', from the line's 去处理): ← 返回资料库, 「n 个文件缺少文件头」 + 全部写入, the sentence of
//   what this is, then one card per file (confirmation): its path and 缺少文件头, 尚未入库, the suggested header in a text box you
//   may change (lib/header-text.js), 写入 · 跳过. Written only on a click (applyHeader / applyAllHeaders → the core's
//   applyProposedHeader → writeNoteFile by 'import-header': the body byte for byte, V2 / V8); 跳过 writes nothing and hides the card
//   until the page is opened again; a file the core cannot propose a header for says why and has no 写入.
// Data only through the bridge (getLibrary, searchLibrary, readNote, getSources for the topics, openInObsidian, showNoteInFolder,
// openReader, applyHeader, applyAllHeaders); read again on `library-changed`. The page counts nothing.
// Test hooks: main[data-screen="library"][data-state][data-mode=list|missing-header], [data-part="view-switch"] [data-mode=list|graph],
// input[data-field="search"], [data-view=all|kept|authored][data-count][aria-current], [data-filter-topic=<name>][aria-pressed],
// [data-filter-days][aria-pressed], [data-part="missing-header-hint"][data-count] with [data-action="go-missing-header"],
// [data-part=list|reader|search-count|search-none|empty|pick-one], [data-row=<id>][data-current][data-status] (its
// [data-snippet]), [data-reader=<id>] with [data-part=mark|reader-source|reader-meta|body], [data-part="item-actions"][data-id] with
// [data-action=edit|source|more][data-items], the menu's [data-menu-item=obsidian|folder|browser]; 详情: [data-part="note-panel"]
// [data-id] with [data-part="detail-record"], [data-part="detail-file"],
// [data-part=backlinks|same-source] [data-link=<id>]; 缺少文件头: [data-part="missing-header"][data-count], [data-action=back-to-library|
// apply-all|apply|skip|show-skipped], [data-card=<file>][data-name-ok][data-proposable] with textarea[data-field="header"],
// [data-card-error], [data-card-why], [data-part=skipped-dirs|apply-all-result|written|skipped-line|missing-none].
import { html, useEffect, useMemo, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { renderMarkdown } from '../lib/markdown.js'
import { headerText, parseHeaderText } from '../lib/header-text.js'
import { TIcon } from '../lib/template-icons.js'
import { Menu } from '../kit/index.js'
import { ERRORS, SEP } from '../texts/common.js'
import { LIBRARY as T } from '../texts/library.js'
import { PANEL } from '../texts/panel.js'
import { EditDialog } from './edit-dialog.js'
import { VerdictFold } from './verdict-dialog.js'
import { LibraryFrame, ViewSwitch } from './library-frame.js'
import { DetailBlock } from './right-panel.js'

/** The three filters of 资料库, in order (redesign R3: every file · kept · your own). */
export const VIEWS = Object.freeze(['all', 'kept', 'authored'])
const RECENT_DAYS = 30
const SEARCH_DELAY_MS = 250

const isWeb = u => typeof u === 'string' && /^https?:\/\//i.test(u)

/** A file's rule not met, in words (exported for test/ui-r5b.test.mjs: never the code itself). */
export function pendingWords(code) {
  const c = String(code ?? '')
  if (Object.hasOwn(T.pending.codes, c)) return T.pending.codes[c]
  if (c.startsWith('missing:')) return fmt(T.pending.missing, { field: c.slice(8) })
  if (c.startsWith('bad-date:')) return fmt(T.pending.badDate, { field: c.slice(9) })
  // redesign R5b (O9): never the code itself
  return T.pending.other
}

const statusWords = s => (Object.hasOwn(T.reader.status, s ?? '') ? T.reader.status[s] : s ?? '')

/** A row of the list (the template's source-card): 日期 · 来源 (or 我的笔记), the title, a line of the summary / the snippet. */
function Row({ item, current, onSelect }) {
  const authored = item.status === 'authored'
  const line = authored ? fmt(T.row.authoredMeta, { date: item.date ?? '' }) : fmt(T.row.meta, { date: item.date ?? '', source: item.source_name ?? '' })
  const sub = item.snippet ?? item.summary ?? ''
  return html`<button type="button" class=${`source-card${current ? ' selected' : ''}`} data-row=${item.id} data-current=${String(current)} data-status=${item.status ?? ''}
    aria-current=${current ? 'true' : undefined} onClick=${() => onSelect(item.id)}>
    <span class="eyebrow"><span>${line}</span><${TIcon} name="arrow" /></span>
    <h3>${item.title}</h3>
    ${sub ? html`<p data-snippet=${item.snippet ? '' : undefined}>${sub}</p>` : null}
  </button>`
}

/** 「更多」 ▾: a button, and under it a menu of `items` ([{ id, label }]); a choice calls onSelect(id). */
function MoreMenu({ items, onSelect }) {
  const button = useRef(null)
  const [at, setAt] = useState(null)
  const open = () => {
    const r = button.current?.getBoundingClientRect()
    if (r) setAt({ x: Math.max(4, r.right - 200), y: r.bottom + 4 })
  }
  return html`<span class="st-act" data-action="more" data-items=${items.map(i => i.id).join(' ')}>
    <button type="button" class="btn quiet" ref=${button} aria-haspopup="menu" aria-expanded=${String(at !== null)} aria-label=${T.actions.moreLabel} onClick=${open}>
      ${T.actions.more}<${TIcon} name="down" />
    </button>
    ${at ? html`<${Menu} label=${T.actions.moreLabel} x=${at.x} y=${at.y} items=${items}
      onSelect=${id => { setAt(null); onSelect(id) }}
      onClose=${({ restoreFocus }) => { setAt(null); if (restoreFocus) button.current?.focus() }} />` : null}
  </span>`
}

/** The reading area's paper: 来源 / 主题, the title, 发布 · 收藏, the text. */
function Paper({ note, resolve, onWiki }) {
  const e = note.entry ?? {}
  const where = [e.status === 'authored' ? T.panel.authored : e.source_name ?? '', (e.topics ?? []).join(SEP)].filter(Boolean).join(' / ')
  const meta = [e.date ? fmt(T.reader.published, { date: e.date }) : null, e.kept ? fmt(T.reader.kept, { date: e.kept }) : null].filter(Boolean)
  return html`<article class="reader-paper" data-reader=${e.id}>
    <span class="eyebrow" data-part="reader-source">${where}</span>
    <h2 class="reader-title">${e.title}</h2>
    ${meta.length ? html`<div class="reader-meta" data-part="reader-meta">${meta.join(SEP)}</div>` : null}
    <div class="readable md" data-part="body">${renderMarkdown(note.body ?? '', { resolve, onWiki, missingTitle: T.reader.missingLink })}</div>
  </article>`
}

/** 详情 of the note being read: 核验 (the folded record), 文件, 反向链接, 同来源内容 — what the reading area does not show. */
function NoteDetail({ note, onSelect }) {
  const e = note.entry ?? {}
  const P = T.panel
  const backlinks = Array.isArray(note.backlinks) ? note.backlinks : []
  const same = Array.isArray(note.sameSource) ? note.sameSource : []
  return html`<${DetailBlock} where=${PANEL.detail.where.library} title=${e.title} part="detail-library">
    <div class="st-rp-detail" data-part="note-panel" data-id=${e.id}>
      ${e.status === 'kept' && isWeb(e.source) ? html`<div class="panel-section" data-part="detail-check">
        <div class="section-label"><span>${P.check}</span></div>
        <${VerdictFold} url=${e.source} />
      </div>` : null}
      <div class="panel-section" data-part="detail-file">
        <div class="section-label"><span>${P.file}</span></div>
        <p class="limit-note st-path" data-path=${note.path ?? note.file ?? ''}>${note.path ?? note.file ?? ''}</p>
      </div>
      <div class="panel-section" data-part="backlinks">
        <div class="section-label"><span>${P.backlinks}</span></div>
        ${backlinks.length ? backlinks.map(b => html`<button type="button" key=${b.id} class="file-row" data-link=${b.id} onClick=${() => onSelect(b.id)}>
          <span class="file-icon"><${TIcon} name="note" /></span><span class="file-text">${b.title}</span><${TIcon} name="arrow" /></button>`)
          : html`<p class="limit-note">${P.backlinksNone}</p>`}
      </div>
      <div class="panel-section" data-part="same-source">
        <div class="section-label"><span>${P.sameSource}</span></div>
        ${same.length ? same.map(b => html`<button type="button" key=${b.id} class="file-row" data-link=${b.id} onClick=${() => onSelect(b.id)}>
          <span class="file-icon"><${TIcon} name="file" /></span><span class="file-text">${b.title}<small>${[b.date ?? '', e.source_name ?? ''].filter(Boolean).join(SEP)}</small></span><${TIcon} name="arrow" /></button>`)
          : html`<p class="limit-note">${P.sameSourceNone}</p>`}
      </div>
    </div>
  <//>`
}

/** The text box's first text for a file: its proposed header, the date marked when it was taken from the file's mtime. */
function proposedText(item) {
  const codes = Array.isArray(item.codes) ? item.codes : []
  const dated = codes.includes('no-frontmatter') || codes.includes('missing:date')
  return headerText(item.proposedHeader, { comments: dated ? { date: T.pending.dateComment } : {} })
}

/** One file without a header (the template's confirmation card): its path, the suggested header, 写入 · 跳过. Exported for
 * test/ui-r5b.test.mjs (precheck fix 5: drawn, its words have no code). */
export function HeaderCard({ item, busy, onApply, onSkip }) {
  const P = T.pending
  const initial = useMemo(() => (item.proposedHeader ? proposedText(item) : ''), [item.file, item.bodyHash, JSON.stringify(item.proposedHeader ?? null)])
  const [text, setText] = useState(initial)
  const [error, setError] = useState(null)
  const [writing, setWriting] = useState(false)
  useEffect(() => { setText(initial); setError(null) }, [initial])
  const codes = Array.isArray(item.codes) ? item.codes : []
  const id = `hdr-${item.file.replace(/[^A-Za-z0-9_-]/g, c => c.charCodeAt(0).toString(16))}`
  const proposable = Boolean(item.proposedHeader) && item.nameOk !== false
  const folder = typeof item.path === 'string' && item.path.length > item.file.length ? item.path.slice(0, item.path.length - item.file.length) : ''
  const write = async () => {
    setError(null)
    let header = null
    if (text !== initial) {
      const r = parseHeaderText(text)
      if (!r.ok) { setError(fmt(P.parseFailed, { line: r.line })); return }
      header = r.header
    }
    setWriting(true)
    try { await onApply(item.file, header) } catch (err) { setError(err?.code === 'bad_arguments' ? P.failed : P.failedOther) } finally { setWriting(false) }
  }
  let why = null
  if (item.nameOk === false) why = fmt(P.badName, { name: item.file.replace(/\.md$/i, '') })
  else if (!item.proposedHeader) why = fmt(P.notProposable, { problems: codes.map(pendingWords).join(SEP) })
  return html`<article class="confirmation" data-card=${item.file} data-name-ok=${String(item.nameOk !== false)} data-proposable=${String(proposable)} aria-labelledby=${`${id}-file`}>
    <div class="confirm-top">
      <div class="confirm-title"><${TIcon} name="file" />
        <div><h2 id=${`${id}-file`}>${item.file}</h2><small data-part="card-codes">${[folder, codes.map(pendingWords).join(SEP)].filter(Boolean).join(SEP)}</small></div>
      </div>
      <span class="confirm-number">${P.notYet}</span>
    </div>
    <div class="card-body">
      ${why ? html`<p class="intro-copy" data-card-why>${why}</p>` : html`<label class="field"><span>${P.headerLabel}</span>
        <textarea id=${`${id}-header`} data-field="header" rows=${Math.max(5, text.split('\n').length + 1)} spellcheck=${false}
          value=${text} onInput=${e => setText(e.currentTarget.value)}></textarea></label>`}
      ${error ? html`<p class="progress-alert" role="alert" data-card-error>${error}</p>` : null}
    </div>
    <div class="confirm-footer">
      <span class="muted">${P.footNote}</span>
      <div class="row">
        <span class="st-act" data-action="skip"><button type="button" class="btn quiet" disabled=${writing} onClick=${() => onSkip(item.file)}>${P.skip}</button></span>
        ${proposable ? html`<span class="st-act" data-action="apply"><button type="button" class="btn primary" disabled=${busy || writing} onClick=${write}><${TIcon} name="approve" fallback="check" />${writing ? P.applying : P.apply}</button></span>` : null}
      </div>
    </div>
  </article>`
}

/** 缺少文件头 (P12): back, the head with 全部写入, what this is, a card per file; what was written, what was skipped. */
function MissingHeaders({ data, status, onBack }) {
  const P = T.pending
  const items = Array.isArray(data?.items) ? data.items : []
  const skippedDirs = Array.isArray(data?.skippedDirs) ? data.skippedDirs : []
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
    try { setAllResult(await call('applyAllHeaders')) } catch { setAllError(P.failedOther) } finally { setBusy(false) }
  }
  return html`<div class="st-main__body thread-scroll lib-missing" data-part="missing-header" data-count=${items.length}>
    <div class="thread">
      <div class="after-card"><span class="st-act" data-action="back-to-library"><button type="button" onClick=${onBack}><${TIcon} name="back" /> ${P.back}</button></span></div>
      <div class="section-label">
        <span><b id="library-title">${items.length ? fmt(P.heading, { n: items.length }) : P.none}</b></span>
        ${items.length ? html`<span class="st-act" data-action="apply-all"><button type="button" disabled=${busy || proposable.length === 0} onClick=${applyAll}>${busy ? P.applyingAll : P.applyAll}</button></span>` : null}
      </div>
      <p class="intro-copy">${P.note}</p>
      ${status === 'error' && !data ? html`<div class="progress-alert" role="alert">${T.loadFailed}</div>` : null}
      ${skippedDirs.length ? html`<p class="limit-note" data-part="skipped-dirs" data-dirs=${skippedDirs.join('\n')}>${fmt(P.subfolders, { dirs: skippedDirs.join(SEP) })}</p>` : null}
      ${done ? html`<div class="progress-alert" role="status" data-part="written" data-file=${done.file}>${fmt(P.written, { file: done.file, view: done.view })}</div>` : null}
      ${allResult ? html`<div class="progress-alert" role="status" data-part="apply-all-result" data-written=${allResult.written.length} data-left=${allResult.skipped.length}>
        ${fmt(P.allWritten, { n: allResult.written.length })}${allResult.skipped.length ? ` ${fmt(P.allLeft, { n: allResult.skipped.length, files: allResult.skipped.map(x => x.file).join(SEP) })}` : ''}
      </div>` : null}
      ${allError ? html`<div class="progress-alert" role="alert">${allError}</div>` : null}
      ${data && !items.length ? html`<div class="empty-state" data-part="missing-none"><${TIcon} name="check" /><b>${P.none}</b></div>` : null}
      <div class="st-stack">${shown.map(it => html`<${HeaderCard} key=${it.file} item=${it} busy=${busy} onApply=${apply} onSkip=${f => setSkipped(list => (list.includes(f) ? list : [...list, f]))} />`)}</div>
      ${skippedHere && !showSkipped ? html`<p class="limit-note" data-part="skipped-line" data-count=${skippedHere}>${fmt(P.skippedLine, { n: skippedHere })}
        <span class="st-act" data-action="show-skipped"><button type="button" class="btn quiet" onClick=${() => setShowSkipped(true)}>${P.showSkipped}</button></span></p>` : null}
    </div>
  </div>`
}

export function LibraryScreen({ params = {} }) {
  const { navigate } = useApp()
  const missing = params.view === 'pending'
  const [view, setView] = useState(VIEWS.includes(params.view) ? params.view : 'all')
  const [topics, setTopics] = useState([])
  const [days, setDays] = useState(null)
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(typeof params.id === 'string' ? params.id : null)
  const [editing, setEditing] = useState(false)
  const [actionError, setActionError] = useState(null)
  const topicsKey = topics.join('\n')

  const lib = useLoad(() => call('getLibrary', missing ? 'pending' : view, missing ? null : { topics, days }), [missing, view, topicsKey, days])
  const found = useLoad(() => (q && !missing ? call('searchLibrary', q, { view, topics, days }) : null), [q, view, topicsKey, days, missing])
  const note = useLoad(() => (selected && !missing ? call('readNote', selected) : null), [selected, missing])
  const sources = useLoad(() => call('getSources'), [])
  // every file's id and title, to say which note a [[link]] names (the core's rule: an exact id first, then an exact title)
  const names = useLoad(() => call('getLibrary', 'all', { topics: [], days: null }), [])
  useEvent('library-changed', () => { lib.reload(); found.reload(); note.reload(); names.reload(); sources.reload() })

  // a navigation that names a note (the graph, an answer's citation, the 文件 tab) opens it
  useEffect(() => { if (typeof params.id === 'string') setSelected(params.id) }, [params.id])
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim().slice(0, 200)), SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [query])

  const items = missing ? [] : lib.data?.items ?? []
  const counts = lib.data?.counts ?? null
  const results = q ? (Array.isArray(found.data) ? found.data : []) : null
  // nothing chosen yet: the first of the list
  useEffect(() => {
    if (missing || selected || results) return
    if (lib.data?.view === view && items.length) setSelected(items[0].id)
  }, [lib.data, view, missing])

  const byName = useMemo(() => {
    const map = new Map()
    for (const it of names.data?.items ?? []) if (!map.has(it.id)) map.set(it.id, it.id)
    for (const it of names.data?.items ?? []) if (typeof it.title === 'string' && !map.has(it.title)) map.set(it.title, it.id)
    return map
  }, [names.data])
  const resolve = target => byName.get(target) ?? null

  const choose = id => { setSelected(id); setActionError(null) }
  const toggleTopic = t => setTopics(list => (list.includes(t) ? list.filter(x => x !== t) : [...list, t]))
  const toggleDays = () => setDays(d => (d === RECENT_DAYS ? null : RECENT_DAYS))
  const doCall = async (name, ...args) => {
    setActionError(null)
    try { await call(name, ...args) } catch { setActionError(T.actions.failed) }
  }
  const topicNames = (sources.data?.topics ?? []).map(t => t.name).filter(n => typeof n === 'string')

  if (missing) {
    return html`<${LibraryFrame} tab="library" state=${lib.data ? 'ready' : lib.status} labelledby="library-title">
      <${MissingHeaders} data=${lib.data?.view === 'pending' ? lib.data : null} status=${lib.status} onBack=${() => navigate('library')} />
    <//>`
  }

  const n = note.data
  const entry = n?.entry ?? null
  const reading = entry && selected && entry.id === selected ? entry : null

  let list
  if (results) {
    list = found.status === 'loading' && !found.data ? html`<p class="limit-note">${T.searching}</p>`
      : results.length ? results.map(r => html`<${Row} key=${r.id} item=${r} current=${r.id === selected} onSelect=${choose} />`)
        : html`<p class="limit-note" data-part="search-none">${T.searchNone}</p>`
  } else if (lib.status === 'error' && !lib.data) {
    list = html`<div class="progress-alert" role="alert">${lib.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed} <button type="button" class="btn quiet" onClick=${() => lib.reload()}>${ERRORS.retry}</button></div>`
  } else if (lib.data && !items.length) {
    list = html`<div class="empty-state" data-part="empty"><${TIcon} name="file" /><b>${topics.length || days ? T.filteredEmpty : T.empty[view]}</b></div>`
  } else {
    list = items.map(it => html`<${Row} key=${it.id} item=${it} current=${it.id === selected} onSelect=${choose} />`)
  }

  let paper
  if (n && reading) paper = html`<${Paper} note=${n} resolve=${resolve} onWiki=${choose} />`
  else if (note.status === 'error' && selected) paper = html`<p class="progress-alert" role="alert">${T.reader.loadFailed}</p>`
  else paper = html`<div class="empty-state" data-part="pick-one"><${TIcon} name="file" /><b>${T.reader.none}</b></div>`

  let actions = null
  if (reading) {
    const e = reading
    const more = [{ id: 'obsidian', label: T.actions.obsidian }, { id: 'folder', label: T.actions.folder }, ...(isWeb(e.source) ? [{ id: 'browser', label: T.actions.browser }] : [])]
    const pick = id => {
      if (id === 'obsidian') doCall('openInObsidian', e.id)
      else if (id === 'folder') doCall('showNoteInFolder', e.id)
      else if (id === 'browser') doCall('openReader', e.source, 'browser')
    }
    actions = html`<div class="reader-header" data-part="item-actions" data-id=${e.id}>
      <span class="status-chip" data-part="mark" data-status=${e.status ?? ''}>${statusWords(e.status)}</span>
      <span class="spacer"></span>
      <span class="st-act" data-action="edit"><button type="button" class="btn quiet" onClick=${() => setEditing(true)}>${T.actions.edit}</button></span>
      ${isWeb(e.source) ? html`<span class="st-act" data-action="source"><button type="button" class="btn quiet" onClick=${() => doCall('openReader', e.source, 'reader')}><${TIcon} name="external" /> ${T.actions.source}</button></span>` : null}
      <${MoreMenu} items=${more} onSelect=${pick} />
    </div>`
  }

  const detail = n && reading ? html`<${NoteDetail} note=${n} onSelect=${choose} />`
    : html`<div class="panel-summary"><span class="eyebrow">${PANEL.tabs.detail}</span><p class="st-rp-none" data-part="detail-none">${T.panel.none}</p></div>`
  const state = lib.data ? 'ready' : lib.status
  return html`<${LibraryFrame} tab="library" state=${state} labelledby="library-title" detail=${detail}>
    <div class="st-split lib-split">
      <section class="st-list st-main__body" data-part="list" aria-labelledby="library-title">
        <div class="section-label st-lib-head">
          <span><b id="library-title">${T.title}</b></span>
          <${ViewSwitch} current="list" onSelect=${v => { if (v === 'graph') navigate('graph') }} />
        </div>
        <label class="search-field"><${TIcon} name="search" /><input type="search" data-field="search" aria-label=${T.searchLabel} placeholder=${T.searchPlaceholder} maxlength="200"
          value=${query} onInput=${e => setQuery(e.currentTarget.value)} /></label>
        <div class="filters" role="group" aria-label=${T.viewsLabel}>
          ${VIEWS.map(id => html`<button key=${id} type="button" class=${`filter${id === view ? ' active' : ''}`} data-view=${id} data-count=${counts?.[id] ?? ''}
            aria-current=${id === view ? 'true' : undefined} onClick=${() => { if (id !== view) { setView(id); setSelected(null); setQuery(''); setQ('') } }}>${fmt(T.viewCount, { name: T.views[id], n: counts?.[id] ?? '' })}</button>`)}
        </div>
        <div class="filters" role="group" aria-label=${T.filtersLabel}>
          ${topicNames.map(t => html`<button key=${t} type="button" class=${`filter${topics.includes(t) ? ' active' : ''}`} data-filter-topic=${t} aria-pressed=${String(topics.includes(t))} onClick=${() => toggleTopic(t)}>${t}</button>`)}
          <button type="button" class=${`filter${days === RECENT_DAYS ? ' active' : ''}`} data-filter-days=${RECENT_DAYS} aria-pressed=${String(days === RECENT_DAYS)} onClick=${toggleDays}>${T.recent}</button>
        </div>
        ${(counts?.pending ?? 0) > 0 ? html`<div class="progress-alert st-lib-hint" data-part="missing-header-hint" data-count=${counts.pending}>
          <span>${fmt(T.pending.hint, { n: counts.pending })}</span>
          <span class="st-act" data-action="go-missing-header"><button type="button" class="btn quiet" onClick=${() => navigate('library', { view: 'pending' })}>${T.pending.go}</button></span>
        </div>` : null}
        ${results ? html`<p class="limit-note" data-part="search-count" data-count=${results.length}>${fmt(T.searchCount, { n: results.length })}</p>` : null}
        ${list}
      </section>
      <section class="reader" data-part="reader" aria-label=${T.reader.label}>
        ${actions}
        <div class="reader-scroll">
          ${actionError ? html`<p class="progress-alert" role="alert">${actionError}</p>` : null}
          ${paper}
        </div>
      </section>
    </div>
    ${editing && n ? html`<${EditDialog} note=${n} topics=${topicNames} onClose=${() => setEditing(false)}
      onSaved=${() => { setEditing(false); note.reload(); lib.reload(); names.reload() }} />` : null}
  <//>`
}
