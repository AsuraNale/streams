// 资料库与阅读 (mockup S6; docs/desktop.md §4.2). Three columns: the list (the search box on top, four tabs with their
// counts, the topic and 「最近 30 天」 filters) · the reader (the note's Markdown cut into elements by lib/markdown.js;
// a [[link]] that names a note in the library opens it) · the right panel (this note: topics, source, the scores with
// their reasons, freshness, the file; the notes that link here; the notes from the same source). The top bar: 「编辑」
// (screens/edit-dialog.js), 「用 Obsidian 打开」, 「打开原文」. 「抓到的」 lists what the core's ledger holds short of kept or
// let go, with each step's score and the step it stopped at; 「待规范」 lists the files and their problems, read only.
// Data only through the bridge (getLibrary, searchLibrary, readNote, getSources for the topics, openInObsidian, openItemUrl);
// read again on `library-changed`. The page counts nothing: the tab counts are getLibrary().counts.
// Test hooks: main[data-screen="library"][data-state], [data-view=<id>][data-count][aria-current], [data-filter-topic=<name>],
// [data-filter-days], input[data-field="search"], [data-part=list|reader|note-panel|backlinks|same-source],
// [data-row=<id | url | file>][data-current], [data-reader=<id>], [data-panel-row=<key>],
// [data-action=edit|obsidian|source|verdicts|caught-verdicts], [data-stopped=<step>], [data-score=<node>].
import { html, useEffect, useMemo, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { renderMarkdown } from '../lib/markdown.js'
import { AppFrame, AppSidebar, LinkButton, Main, Panel, Tag, TopBar } from '../kit/index.js'
import { ERRORS, NODE_NAMES, NOTE_STATUS, SEP } from '../texts/common.js'
import { LIBRARY as T } from '../texts/library.js'
import { EditDialog } from './edit-dialog.js'
import { VerdictDialog } from './verdict-dialog.js'

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

function Reader({ note, resolve, onWiki }) {
  const e = note.entry ?? {}
  const meta = [
    e.source ? fmt(T.reader.source, { source: e.source }) : null,
    e.date ? fmt(T.reader.date, { date: e.date }) : null,
    e.kept ? fmt(T.reader.kept, { date: e.kept }) : null,
  ].filter(Boolean)
  return html`<article class="lib-reader__note" data-reader=${e.id}>
    <div class="lib-reader__status">
      <${Tag} tone=${e.status === 'authored' ? 'recommend' : 'done'}>${NOTE_STATUS[e.status] ?? e.status ?? ''}<//>
    </div>
    <h2 class="lib-reader__title st-t-heading">${e.title}</h2>
    <div class="lib-reader__meta st-t-small st-t-sub">${meta.join(SEP)}</div>
    <div class="lib-reader__body md" data-part="body">${renderMarkdown(note.body ?? '', { resolve, onWiki, missingTitle: T.reader.missingLink })}</div>
  </article>`
}

function CaughtReader({ item, onVerdicts }) {
  return html`<article class="lib-reader__note" data-reader=${item.url}>
    <div class="lib-reader__status"><${Tag} tone="wait">${T.views.caught}<//></div>
    <h2 class="lib-reader__title st-t-heading">${item.title}</h2>
    <div class="lib-reader__meta st-t-small st-t-sub">${[fmt(T.caught.source, { source: item.source ?? '', date: item.date ?? '' }), fmt(T.caught.firstSeen, { date: (item.firstSeen ?? '').slice(0, 10) })].join(SEP)}</div>
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

export function LibraryScreen({ params = {} }) {
  const [view, setView] = useState(VIEWS.includes(params.view) ? params.view : 'kept')
  const [topics, setTopics] = useState([])
  const [days, setDays] = useState(null)
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(typeof params.id === 'string' ? params.id : null)
  const [caughtUrl, setCaughtUrl] = useState(null)
  const [editing, setEditing] = useState(false)
  const [verdictsFor, setVerdictsFor] = useState(null)
  const [actionError, setActionError] = useState(null)
  const topicsKey = topics.join('\n')
  const filter = { topics, days }

  const lib = useLoad(() => call('getLibrary', view, filter), [view, topicsKey, days])
  const searchView = view === 'kept' || view === 'authored' ? view : 'all'
  const found = useLoad(() => (q ? call('searchLibrary', q, { view: searchView, topics, days }) : null), [q, searchView, topicsKey, days])
  const note = useLoad(() => (selected ? call('readNote', selected) : null), [selected])
  const sources = useLoad(() => call('getSources'), [])
  // every note's id and title, to say which note a [[link]] names (a lookup in the index, the core's resolution rule:
  // an exact id first, then an exact title)
  const names = useLoad(() => Promise.all([call('getLibrary', 'kept', { topics: [], days: null }), call('getLibrary', 'authored', { topics: [], days: null })]), [])
  useEvent('library-changed', () => { lib.reload(); found.reload(); note.reload(); names.reload(); sources.reload() })

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
    list = html`<p class="lib-list__note st-t-small st-t-sub">${T.pending.note}</p><ul class="lib-list__rows">${items.map(it => html`<${PendingRow} key=${it.file} item=${it} />`)}</ul>`
  } else {
    list = html`<ul class="lib-list__rows">${items.map(it => html`<${NoteRow} key=${it.id} item=${it} current=${it.id === selected} onSelect=${choose} />`)}</ul>`
  }

  let reader
  if (caughtItem) reader = html`<${CaughtReader} item=${caughtItem} onVerdicts=${() => setVerdictsFor({ url: caughtItem.url, title: caughtItem.title })} />`
  else if (mode === 'caught') reader = html`<p class="st-t-small st-t-muted">${T.reader.none}</p>`
  else if (mode === 'pending') reader = html`<p class="st-t-small st-t-muted">${T.pending.note}</p>`
  else if (n) reader = html`<${Reader} note=${n} resolve=${resolve} onWiki=${choose} />`
  else if (note.status === 'error') reader = html`<p class="lib-error" role="alert">${T.reader.loadFailed}</p>`
  else reader = html`<p class="st-t-small st-t-muted">${T.reader.none}</p>`

  const actions = html`<div class="lib-actions">
    <${Act} name="edit" disabled=${!showNote || !entry} onClick=${() => setEditing(true)}>${T.actions.edit}<//>
    <${Act} name="obsidian" disabled=${!showNote || !entry} onClick=${() => doCall('openInObsidian', entry.id)}>${T.actions.obsidian}<//>
    <${Act} name="source" disabled=${!showNote || !entry || !isWeb(entry.source)} onClick=${() => doCall('openItemUrl', entry.source)}>${T.actions.source}<//>
  </div>`
  const panel = html`<${Panel} label=${T.panel.title}>
    ${showNote ? html`<${NotePanel} note=${n} onSelect=${choose} onVerdicts=${() => setVerdictsFor({ url: entry.source, title: entry.title })} />` : html`<div class="lib-panel" data-part="note-panel"><p class="st-t-small st-t-muted">${T.panel.none}</p></div>`}
  <//>`
  const state = lib.data ? 'ready' : lib.status
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="library" />`} panel=${panel}>
    <${Main} screen="library" state=${state} labelledby="library-title">
      <${TopBar} title=${T.title} titleTag="h1" titleId="library-title"
        subtitle=${showNote && entry ? NOTE_STATUS[entry.status] ?? '' : caughtItem ? T.views.caught : null} actions=${actions} />
      <div class="st-main__body lib-body">
        <section class="lib-list" data-part="list" aria-label=${T.views[view]}>
          <div class="lib-list__head">
            <input type="search" class="lib-search" data-field="search" aria-label=${T.searchLabel} placeholder=${T.searchPlaceholder} maxlength="200"
              value=${query} onInput=${e => setQuery(e.currentTarget.value)} />
            <${ViewTabs} view=${view} counts=${counts} onSelect=${id => { setView(id); setCaughtUrl(null); setQuery(''); setQ('') }} />
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
    <//>
    ${editing && n ? html`<${EditDialog} note=${n} topics=${topicNames} onClose=${() => setEditing(false)}
      onSaved=${() => { setEditing(false); note.reload(); lib.reload(); names.reload() }} />` : null}
    ${verdictsFor ? html`<${VerdictDialog} url=${verdictsFor.url} title=${verdictsFor.title} onClose=${() => setVerdictsFor(null)} />` : null}
  <//>`
}
