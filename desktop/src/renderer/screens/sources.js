// 来源与主题 (mockup S5; docs/desktop.md §4.2). One row per source: its name, its kind and address (or search words), its
// state from the last round in the five words with the count or the rounds in a row, and what to do about it (the
// core's hint code → texts/common.js FETCH_HINTS); its topic; 「试抓」 (trySource: nothing written), 「暂停 / 恢复」,
// 「改地址」, 「删除」 (asked first). The top bar: 「贴一个链接进待看」 (addManualLink) and 「加来源」: paste an address or search
// words → guessSource → the kind can be changed → a name and a default topic → 「试抓」 shows the count and the newest
// item → 「加入」 (only after a try that reached the source). The topics: name, keywords (a fixed anchor the software never
// changes by itself), how many kept; add, change the keywords, remove (asked first). Everything through the bridge
// (getSources and the source / topic methods); read again after each change and on `library-changed`.
// Test hooks: main[data-screen="sources"][data-state], [data-part=sources|topics], [data-row=<name>][data-state][data-paused],
// [data-hint=<code>], [data-tried=<name>][data-state], [data-topic-row=<name>], dialogs [data-dialog=add-source|add-link|
// edit-source|remove-source|remove-topic] with input / select [data-field=…] and [data-action=…].
import { html, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { AppFrame, AppSidebar, Dialog, LinkButton, Main, TopBar } from '../kit/index.js'
import { ERRORS, FETCH_HINTS, FETCH_STATES, SEP, SOURCE_KINDS, SOURCE_STATES } from '../texts/common.js'
import { SOURCES as T } from '../texts/sources.js'

const KINDS = ['rss', 'arxiv', 'hn']
const ADDABLE = ['ok', 'empty', 'failed']
const kindWord = k => (Object.hasOwn(SOURCE_KINDS, k) ? SOURCE_KINDS[k] : String(k ?? ''))
const stateWord = s => (Object.hasOwn(FETCH_STATES, s) ? FETCH_STATES[s] : Object.hasOwn(SOURCE_STATES, s) ? SOURCE_STATES[s] : String(s ?? ''))
const hintWords = h => (Object.hasOwn(FETCH_HINTS, h) ? FETCH_HINTS[h] : null)
const bare = u => String(u ?? '').replace(/^https?:\/\//i, '')
const keywordList = text => String(text ?? '').split(/[,，、;；\n]+/).map(s => s.trim()).filter(Boolean)
/** The part of a source the configuration holds (what trySource / addSource take), without the state the view adds. */
const CONFIG_KEYS = ['name', 'kind', 'url', 'query', 'topic', 'min_points', 'max_results', 'paused']
const configOf = s => Object.fromEntries(CONFIG_KEYS.filter(k => s[k] !== undefined && s[k] !== null).map(k => [k, s[k]]))

/** A source's state as the row shows it: paused, never fetched, or one of the five. */
export function rowState(s) {
  if (s.paused) return 'paused'
  if (typeof s.status !== 'string' || s.status === '') return 'never'
  return s.status
}

function stateLine(s) {
  const state = rowState(s)
  const word = stateWord(state)
  if (state === 'ok') return fmt(T.row.count, { state: word, n: s.count ?? 0 })
  if (['failed', 'gap', 'blocked'].includes(state)) {
    return s.http ? fmt(T.row.streak, { state: word, http: s.http, n: s.consecutive ?? 1 }) : fmt(T.row.streakNoHttp, { state: word, n: s.consecutive ?? 1 })
  }
  return word
}

function TriedLine({ name, tried }) {
  if (!tried) return null
  if (tried.status === 'trying') return html`<div class="src-tried st-t-small st-t-sub" data-tried=${name} data-state="trying" role="status">${T.row.trying}</div>`
  if (tried.status === 'error') return html`<div class="src-tried st-t-small st-t-wait" data-tried=${name} data-state="error" role="alert">${T.failed}</div>`
  const r = tried.result ?? {}
  const latest = Array.isArray(r.sample) && r.sample[0] ? r.sample[0] : null
  const head = ['ok', 'empty'].includes(r.status) ? fmt(T.tried.ok, { state: stateWord(r.status), n: r.count ?? 0 }) : fmt(T.tried.message, { state: stateWord(r.status), message: r.http ? fmt(T.tried.http, { http: r.http }) : r.message ?? '' })
  const tail = latest ? (latest.date ? fmt(T.tried.latest, { title: latest.title, date: String(latest.date).slice(0, 10) }) : fmt(T.tried.latestNoDate, { title: latest.title })) : null
  return html`<div class="src-tried st-t-small" data-tried=${name} data-state=${r.status ?? ''} role="status">
    <span class=${`st-fetch st-fetch--${['ok', 'empty', 'gap', 'failed', 'blocked'].includes(r.status) ? r.status : 'empty'}`}>${head}</span>
    ${tail ? html`<span class="st-t-sub">${tail}</span>` : null}
    ${r.hint && r.hint !== 'none' && hintWords(r.hint) ? html`<span class="st-t-sub">${hintWords(r.hint)}</span>` : null}
  </div>`
}

function SourceRow({ s, tried, busy, onTry, onPause, onEdit, onRemove }) {
  const state = rowState(s)
  const address = s.kind === 'rss' ? bare(s.url) : s.query ?? ''
  const hint = state === 'paused' || state === 'never' ? null : s.hint ?? null
  const five = ['ok', 'empty', 'gap', 'failed', 'blocked'].includes(state)
  return html`<li class="src-row" data-row=${s.name} data-state=${state} data-paused=${String(Boolean(s.paused))} data-consecutive=${s.consecutive ?? ''}>
    <div class="src-row__main">
      <div class="src-row__name st-t-strong">${s.name}</div>
      <div class="src-row__address st-t-small st-t-sub">${s.kind === 'hn' && s.min_points ? fmt(T.row.minPoints, { kind: kindWord(s.kind), address, n: s.min_points }) : fmt(T.row.address, { kind: kindWord(s.kind), address })}</div>
      <div class="src-row__state">
        <span class=${five ? `st-fetch st-fetch--${state}` : 'src-row__plain st-t-small st-t-sub st-t-strong'}>${stateLine(s)}</span>
        ${state === 'empty' && s.lastOkAt ? html`<span class="st-t-small st-t-sub">${fmt(T.row.lastOk, { date: String(s.lastOkAt).slice(0, 10) })}</span>` : null}
        <span class="st-t-small st-t-sub">${s.topic ? fmt(T.row.topic, { topic: s.topic }) : T.row.noTopic}</span>
      </div>
      ${hint && hint !== 'none' && hintWords(hint) ? html`<div class="src-row__hint st-t-small" data-hint=${hint}>${hintWords(hint)}</div>` : null}
      <${TriedLine} name=${s.name} tried=${tried} />
    </div>
    <div class="src-row__actions">
      <${Act} name="try" disabled=${busy || tried?.status === 'trying'} onClick=${onTry}>${T.row.try}<//>
      <${Act} name="pause" disabled=${busy} onClick=${onPause}>${s.paused ? T.row.resume : T.row.pause}<//>
      <${Act} name="edit-address" disabled=${busy} onClick=${onEdit}>${s.kind === 'rss' ? T.row.editAddress : T.row.editQuery}<//>
      <${Act} name="remove" disabled=${busy} onClick=${onRemove}>${T.row.remove}<//>
    </div>
  </li>`
}

/** A name a source could have, from its address or words (the user changes it at will): letters, digits and dashes. */
export function suggestName(kind, target) {
  let base = String(target ?? '')
  if (kind === 'rss') { try { base = new URL(base).hostname.replace(/^www\./, '') } catch { /* not an address yet */ } }
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  return kind === 'rss' || !slug ? slug : `${kind}-${slug}`.slice(0, 40).replace(/-+$/, '')
}

function AddSourceDialog({ topics, onClose, onAdded }) {
  const [input, setInput] = useState('')
  const [kind, setKind] = useState(null)
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [tried, setTried] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const build = () => ({ name: name.trim(), kind, ...(kind === 'rss' ? { url: target.trim() } : { query: target.trim() }), ...(topic ? { topic } : {}) })
  const key = JSON.stringify(kind ? build() : null)
  const fresh = tried && tried.key === key ? tried : null
  const guess = async () => {
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    try {
      const g = await call('guessSource', input.trim())
      const k = KINDS.includes(g?.kind) ? g.kind : 'hn'
      const t = k === 'rss' ? g.url ?? input.trim() : g.query ?? input.trim()
      setKind(k)
      setTarget(t)
      if (!name.trim()) setName(typeof g?.name === 'string' ? g.name : suggestName(k, t))
      setTried(null)
    } catch { setError(T.addDialog.guessFailed) } finally { setBusy(false) }
  }
  const tryIt = async () => {
    const source = build()
    setBusy(true)
    setError(null)
    setTried({ key, status: 'trying' })
    try { setTried({ key, status: 'done', result: await call('trySource', source) }) } catch { setTried({ key, status: 'error' }) } finally { setBusy(false) }
  }
  const add = async () => {
    setBusy(true)
    setError(null)
    try { await call('addSource', build()); onAdded() } catch (err) { setError(err?.code === 'bad_arguments' ? T.addDialog.badSource : T.failed); setBusy(false) }
  }
  const reached = fresh?.status === 'done' && ADDABLE.includes(fresh.result?.status)
  const ready = Boolean(kind) && name.trim() !== '' && target.trim() !== ''
  const actions = html`<${Act} name="cancel-add" disabled=${busy} onClick=${onClose}>${T.addDialog.cancel}<//>
    <${Act} name="try-new" disabled=${busy || !ready} onClick=${tryIt}>${fresh?.status === 'trying' ? T.addDialog.trying : T.addDialog.try}<//>
    <${Act} name="confirm-add" variant="primary" disabled=${busy || !ready || !reached} onClick=${add}>${T.addDialog.confirm}<//>`
  return html`<${Dialog} name="add-source" title=${T.addDialog.title} onCancel=${onClose} actions=${actions}>
    <label class="st-dialog__label" for="src-input">${T.addDialog.inputLabel}</label>
    <div class="src-dialog__row">
      <input id="src-input" class="st-dialog__input" data-field="source-input" placeholder=${T.addDialog.inputPlaceholder} value=${input} data-dialog-initial
        onInput=${e => setInput(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); guess() } }} />
      <${Act} name="guess" disabled=${busy || !input.trim()} onClick=${guess}>${T.addDialog.guess}<//>
    </div>
    ${kind ? html`
      <label class="st-dialog__label" for="src-kind">${T.addDialog.kindLabel}</label>
      <select id="src-kind" class="st-dialog__input" data-field="kind" value=${kind} onChange=${e => setKind(e.currentTarget.value)}>
        ${KINDS.map(k => html`<option key=${k} value=${k} selected=${k === kind}>${kindWord(k)}</option>`)}
      </select>
      <label class="st-dialog__label" for="src-target">${kind === 'rss' ? T.addDialog.urlLabel : T.addDialog.queryLabel}</label>
      <input id="src-target" class="st-dialog__input" data-field="target" value=${target} onInput=${e => setTarget(e.currentTarget.value)} />
      <label class="st-dialog__label" for="src-name">${T.addDialog.nameLabel}</label>
      <input id="src-name" class="st-dialog__input" data-field="name" value=${name} maxlength="40" onInput=${e => setName(e.currentTarget.value)} />
      <span class="st-t-tiny st-t-muted">${T.addDialog.nameHint}</span>
      <label class="st-dialog__label" for="src-topic">${T.addDialog.topicLabel}</label>
      <select id="src-topic" class="st-dialog__input" data-field="topic" value=${topic} onChange=${e => setTopic(e.currentTarget.value)}>
        <option value="" selected=${topic === ''}>${T.addDialog.noTopic}</option>
        ${topics.map(t => html`<option key=${t} value=${t} selected=${t === topic}>${t}</option>`)}
      </select>
      <${TriedLine} name="new" tried=${fresh} />
      ${!fresh ? html`<div class="st-t-small st-t-sub" data-part="try-first">${T.addDialog.tryFirst}</div>` : null}
      ${fresh?.status === 'done' && !reached ? html`<div class="st-dialog__error" data-part="cannot-add">${T.addDialog.cannotAdd}</div>` : null}
    ` : null}
    <p class="st-t-small st-t-muted">${T.addDialog.note}</p>
    ${error ? html`<div class="st-dialog__error" role="alert">${error}</div>` : null}
  <//>`
}

function AddLinkDialog({ onClose }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [done, setDone] = useState(false)
  const web = /^https?:\/\/\S+$/i.test(url.trim())
  const add = async () => {
    if (!web) { setNote(T.linkDialog.bad); return }
    setBusy(true)
    setNote(null)
    try {
      const r = await call('addManualLink', url.trim(), title.trim())
      setNote(r?.added === false ? T.linkDialog.seen : T.linkDialog.added)
      setDone(true)
    } catch (err) { setNote(err?.code === 'bad_arguments' ? T.linkDialog.bad : T.failed) } finally { setBusy(false) }
  }
  const actions = done
    ? html`<${Act} name="close-link" variant="primary" onClick=${onClose}>${T.linkDialog.done}<//>`
    : html`<${Act} name="cancel-link" disabled=${busy} onClick=${onClose}>${T.linkDialog.cancel}<//>
      <${Act} name="confirm-link" variant="primary" disabled=${busy || !url.trim()} onClick=${add}>${T.linkDialog.confirm}<//>`
  return html`<${Dialog} name="add-link" title=${T.linkDialog.title} onCancel=${onClose} actions=${actions}>
    <label class="st-dialog__label" for="src-link-url">${T.linkDialog.urlLabel}</label>
    <input id="src-link-url" class="st-dialog__input" type="url" data-field="link-url" placeholder=${T.linkDialog.urlPlaceholder} value=${url} data-dialog-initial disabled=${done} onInput=${e => setUrl(e.currentTarget.value)} />
    <label class="st-dialog__label" for="src-link-title">${T.linkDialog.titleLabel}</label>
    <input id="src-link-title" class="st-dialog__input" data-field="link-title" value=${title} disabled=${done} onInput=${e => setTitle(e.currentTarget.value)} />
    ${note ? html`<div class=${done ? 'st-t-small st-t-done' : 'st-dialog__error'} role="status" data-part="link-note">${note}</div>` : null}
  <//>`
}

function EditSourceDialog({ source, onClose, onSaved }) {
  const rss = source.kind === 'rss'
  const [value, setValue] = useState(rss ? source.url ?? '' : source.query ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const save = async () => {
    if (!value.trim()) { setError(T.editDialog.bad); return }
    setBusy(true)
    setError(null)
    try { await call('updateSource', source.name, rss ? { url: value.trim() } : { query: value.trim() }); onSaved() } catch { setError(T.editDialog.bad); setBusy(false) }
  }
  const actions = html`<${Act} name="cancel-edit-source" disabled=${busy} onClick=${onClose}>${T.editDialog.cancel}<//>
    <${Act} name="confirm-edit-source" variant="primary" disabled=${busy} onClick=${save}>${T.editDialog.confirm}<//>`
  return html`<${Dialog} name="edit-source" title=${fmt(T.editDialog.title, { name: source.name })} onCancel=${onClose} actions=${actions}>
    <label class="st-dialog__label" for="src-edit">${rss ? T.editDialog.urlLabel : T.editDialog.queryLabel}</label>
    <input id="src-edit" class="st-dialog__input" data-field="address" value=${value} data-dialog-initial onInput=${e => setValue(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
    ${error ? html`<div class="st-dialog__error" role="alert">${error}</div>` : null}
  <//>`
}

function ConfirmDialog({ name, title, text, confirm, cancel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const go = async () => {
    setBusy(true)
    setError(false)
    try { await onConfirm() } catch { setError(true); setBusy(false) }
  }
  const actions = html`<${Act} name="cancel-remove" disabled=${busy} onClick=${onClose}>${cancel}<//>
    <${Act} name="confirm-remove" variant="primary" disabled=${busy} onClick=${go}>${confirm}<//>`
  return html`<${Dialog} name=${name} title=${title} onCancel=${onClose} actions=${actions}>
    <p class="st-dialog__text">${text}</p>
    ${error ? html`<div class="st-dialog__error" role="alert">${T.failed}</div>` : null}
  <//>`
}

function TopicRow({ t, busy, onSave, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const keywords = Array.isArray(t.keywords) ? t.keywords : []
  const kept = t.kept ?? t.keptCount ?? t.count ?? 0
  const save = async () => { if (await onSave(keywordList(text))) setEditing(false) }
  return html`<tr data-topic-row=${t.name} data-kept=${kept}>
    <th scope="row" class="src-topics__name">${t.name}</th>
    <td>
      ${editing ? html`<span class="src-topics__edit">
        <input class="src-topics__input" data-field="keywords" aria-label=${fmt(T.topics.keywordsLabel, { name: t.name })} placeholder=${T.topics.keywordsHint} value=${text} onInput=${e => setText(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
        <${Act} name="save-keywords" disabled=${busy} onClick=${save}>${T.topics.save}<//>
        <${Act} name="cancel-keywords" disabled=${busy} onClick=${() => setEditing(false)}>${T.topics.cancel}<//>
      </span>` : html`<span data-keywords>${keywords.join(SEP)}</span>`}
    </td>
    <td class="src-topics__num st-t-num">${kept}</td>
    <td class="src-topics__actions">
      ${editing ? null : html`<${Act} name="edit-keywords" disabled=${busy} onClick=${() => { setText(keywords.join('，')); setEditing(true) }}>${T.topics.editKeywords}<//>`}
      <${Act} name="remove-topic" disabled=${busy} onClick=${onRemove}>${T.topics.remove}<//>
    </td>
  </tr>`
}

export function SourcesScreen() {
  const view = useLoad(() => call('getSources'), [])
  useEvent('library-changed', () => view.reload())
  const [tried, setTried] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [newTopic, setNewTopic] = useState('')
  const [newKeywords, setNewKeywords] = useState('')
  const [topicError, setTopicError] = useState(null)
  const d = view.data
  const sources = Array.isArray(d?.sources) ? d.sources : []
  const topics = Array.isArray(d?.topics) ? d.topics : []
  const topicNames = topics.map(t => t.name)
  const act = async (fn, after) => {
    setBusy(true)
    setError(null)
    try { await fn(); after?.(); return true } catch { setError(T.failed); return false } finally { setBusy(false); view.reload() }
  }
  const tryOne = async s => {
    setTried(m => ({ ...m, [s.name]: { status: 'trying' } }))
    try { const r = await call('trySource', configOf(s)); setTried(m => ({ ...m, [s.name]: { status: 'done', result: r } })) } catch { setTried(m => ({ ...m, [s.name]: { status: 'error' } })) }
  }
  const saveKeywords = async (t, keywords) => {
    setTopicError(null)
    try { await call('updateTopic', t.name, { keywords }); view.reload(); return true } catch { setTopicError(T.topics.bad); return false }
  }
  const addTopic = async () => {
    if (!newTopic.trim()) { setTopicError(T.topics.bad); return }
    setTopicError(null)
    try {
      await call('addTopic', { name: newTopic.trim(), keywords: keywordList(newKeywords) })
      setNewTopic('')
      setNewKeywords('')
      view.reload()
    } catch { setTopicError(T.topics.bad) }
  }
  const close = () => setDialog(null)
  const title = d ? fmt(T.title, { sources: d.counts?.sources ?? sources.length, topics: d.counts?.topics ?? topics.length }) : T.titlePlain
  const actions = html`<div class="src-actions">
    <${Act} name="add-link" disabled=${!d} onClick=${() => setDialog({ kind: 'add-link' })}>${T.addLink}<//>
    <${Act} name="add-source" variant="primary" icon="plus" disabled=${!d} onClick=${() => setDialog({ kind: 'add-source' })}>${T.addSource}<//>
  </div>`
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="sources" />`}>
    <${Main} screen="sources" state=${d ? 'ready' : view.status} labelledby="sources-title">
      <${TopBar} title=${title} titleTag="h1" titleId="sources-title" actions=${actions} />
      <div class="st-main__body src-body">
        ${view.status === 'error' && !d ? html`<div class="src-error" role="alert">${view.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => view.reload()}>${ERRORS.retry}<//></div>` : null}
        ${error ? html`<div class="src-error" role="alert">${error}</div>` : null}
        ${d ? html`
          <section class="src-part" data-part="sources" aria-labelledby="src-sources">
            <h2 class="st-t-small st-t-sub st-t-strong" id="src-sources">${T.sourcesHeading}</h2>
            ${sources.length ? html`<ul class="src-list">
              ${sources.map(s => html`<${SourceRow} key=${s.name} s=${s} tried=${tried[s.name]} busy=${busy}
                onTry=${() => tryOne(s)}
                onPause=${() => act(() => call('setSourcePaused', s.name, !s.paused))}
                onEdit=${() => setDialog({ kind: 'edit-source', source: s })}
                onRemove=${() => setDialog({ kind: 'remove-source', source: s })} />`)}
            </ul>` : html`<p class="st-t-small st-t-muted" data-part="sources-none">${T.none}</p>`}
          </section>
          <section class="src-part" data-part="topics" aria-labelledby="src-topics">
            <h2 class="st-t-small st-t-sub st-t-strong" id="src-topics">${T.topics.heading}</h2>
            ${topics.length ? html`<table class="src-topics">
              <thead><tr><th scope="col">${T.topics.name}</th><th scope="col">${T.topics.keywords}</th><th scope="col">${T.topics.kept}</th><th scope="col"></th></tr></thead>
              <tbody>${topics.map(t => html`<${TopicRow} key=${t.name} t=${t} busy=${busy} onSave=${k => saveKeywords(t, k)} onRemove=${() => setDialog({ kind: 'remove-topic', topic: t })} />`)}</tbody>
            </table>` : html`<p class="st-t-small st-t-muted">${T.topics.none}</p>`}
            <div class="src-topics__add" data-part="add-topic">
              <input class="src-topics__input" data-field="topic-name" aria-label=${T.topics.addName} placeholder=${T.topics.addName} value=${newTopic} onInput=${e => setNewTopic(e.currentTarget.value)} />
              <input class="src-topics__input src-topics__input--wide" data-field="topic-keywords" aria-label=${T.topics.addKeywords} placeholder=${T.topics.addKeywords} value=${newKeywords} onInput=${e => setNewKeywords(e.currentTarget.value)} />
              <${Act} name="add-topic" disabled=${busy || !newTopic.trim()} onClick=${addTopic}>${T.topics.add}<//>
            </div>
            ${topicError ? html`<div class="src-error" role="alert" data-part="topic-error">${topicError}</div>` : null}
          </section>
        ` : null}
      </div>
    <//>
    ${dialog?.kind === 'add-source' ? html`<${AddSourceDialog} topics=${topicNames} onClose=${close} onAdded=${() => { close(); view.reload() }} />` : null}
    ${dialog?.kind === 'add-link' ? html`<${AddLinkDialog} onClose=${close} />` : null}
    ${dialog?.kind === 'edit-source' ? html`<${EditSourceDialog} source=${dialog.source} onClose=${close} onSaved=${() => { close(); view.reload() }} />` : null}
    ${dialog?.kind === 'remove-source' ? html`<${ConfirmDialog} name="remove-source" title=${fmt(T.removeDialog.title, { name: dialog.source.name })} text=${T.removeDialog.text}
      confirm=${T.removeDialog.confirm} cancel=${T.removeDialog.cancel} onClose=${close}
      onConfirm=${async () => { await call('removeSource', dialog.source.name); close(); view.reload() }} />` : null}
    ${dialog?.kind === 'remove-topic' ? html`<${ConfirmDialog} name="remove-topic" title=${fmt(T.removeTopicDialog.title, { name: dialog.topic.name })} text=${T.removeTopicDialog.text}
      confirm=${T.removeTopicDialog.confirm} cancel=${T.removeTopicDialog.cancel} onClose=${close}
      onConfirm=${async () => { await call('removeTopic', dialog.topic.name); close(); view.reload() }} />` : null}
  <//>`
}
