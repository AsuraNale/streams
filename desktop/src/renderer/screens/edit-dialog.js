// 编辑笔记 — redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-3; design 03-页面稿 P11, 07-模板版 「编辑笔记」, F36): the
// template's dialog (a <dialog> opened with showModal: its own backdrop, focus kept inside, Esc closes) over 资料库, with the
// template's form parts — 标题 (field), 主题 (filters: each topic with ✕; 「＋ 添加主题」 opens a field that takes a new topic or one
// the library already has, from a list), 正文（Markdown） (field), and in the footer 保存 · 插入链接 · 取消 and the line 「仅可修改标题、
// 主题、正文和链接；来源、日期、评分为记录字段，不可修改。」. 插入链接 searches the library (searchLibrary) and puts `[[<title>]]` where
// the cursor is in the body. The rule is the core's and is not touched: only the title, the topics and the body (the [[links]]
// live in the body) are sent — editNote(id, { title?, topics?, body? }) — and only a file that is there and conforms can be edited
// (core editNote → writeNoteFile by 'edit', V2). 「保存」 sends only what changed, then the dialog closes and the screen reads again.
// Words: texts/library.js EDIT.
// Test hooks: dialog[data-dialog="edit"], input[data-field="title"], [data-topic=<name>] with [data-action="remove-topic"],
// [data-action="add-topic"], input[data-field="add-topic"] (its datalist: the library's topics), textarea[data-field="body"],
// [data-action=insert-link|save-edit|cancel-edit|close-edit], input[data-field="link-search"], [data-link-option=<id>],
// [data-part=record|edit-error|no-topic|link-search].
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { TIcon } from '../lib/template-icons.js'
import { EDIT as T } from '../texts/library.js'

const SEARCH_DELAY_MS = 200
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * @param {object} p
 * @param {{ entry: object, body: string }} p.note - readNote's answer
 * @param {string[]} p.topics - the library's topics (streams.json)
 * @param {() => void} p.onClose
 * @param {(r: object) => void} p.onSaved - editNote answered
 */
export function EditDialog({ note, topics, onClose, onSaved }) {
  const e = note.entry ?? {}
  const [title, setTitle] = useState(e.title ?? '')
  const [chosen, setChosen] = useState(Array.isArray(e.topics) ? [...e.topics] : [])
  const [body, setBody] = useState(note.body ?? '')
  const [adding, setAdding] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [options, setOptions] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const box = useRef(null)
  const bodyRef = useRef(null)
  const caret = useRef(null)
  const close = useRef(onClose)
  close.current = onClose

  // the template's dialog is a <dialog>: shown modal as it is drawn (the backdrop, the focus inside, Esc is its cancel)
  useLayoutEffect(() => {
    const d = box.current
    const was = document.activeElement
    if (d && !d.open) d.showModal()
    d?.querySelector('[data-field="title"]')?.focus()
    return () => { if (was && document.contains(was) && typeof was.focus === 'function') was.focus() }
  }, [])

  useEffect(() => {
    if (!linking) return undefined
    const q = linkQuery.trim()
    if (!q) { setOptions([]); return undefined }
    let live = true
    const t = setTimeout(() => {
      call('searchLibrary', q.slice(0, 200), { view: 'all', topics: [], days: null })
        .then(r => { if (live) setOptions((Array.isArray(r) ? r : []).filter(o => o.id !== e.id).slice(0, 8)) }, () => { if (live) setOptions([]) })
    }, SEARCH_DELAY_MS)
    return () => { live = false; clearTimeout(t) }
  }, [linking, linkQuery])

  const remember = () => {
    const el = bodyRef.current
    if (el) caret.current = [el.selectionStart, el.selectionEnd]
  }
  const insert = option => {
    const text = `[[${option.title}]]`
    const [a, b] = caret.current ?? [body.length, body.length]
    const next = body.slice(0, a) + text + body.slice(b)
    setBody(next)
    caret.current = [a + text.length, a + text.length]
    setLinking(false)
    setLinkQuery('')
    setOptions([])
    requestAnimationFrame(() => { const el = bodyRef.current; if (el) { el.focus(); el.setSelectionRange(a + text.length, a + text.length) } })
  }
  const addTopic = () => {
    const t = newTopic.trim()
    if (t) setChosen(list => (list.includes(t) ? list : [...list, t]))
    setNewTopic('')
    setAdding(false)
  }

  const known = (topics ?? []).filter(t => !chosen.includes(t))
  const changes = {}
  if (title.trim() !== (e.title ?? '')) changes.title = title.trim()
  if (!sameList(chosen, e.topics ?? [])) changes.topics = chosen
  if (body !== (note.body ?? '')) changes.body = body
  const ready = !busy && title.trim() !== '' && chosen.length > 0
  const save = async () => {
    if (!ready) return
    if (!Object.keys(changes).length) { onClose(); return }
    setBusy(true)
    setError(null)
    try {
      const r = await call('editNote', e.id, changes)
      onSaved(r)
    } catch (err) {
      setError(err?.code === 'bad_arguments' ? T.failed : T.failedOther)
      setBusy(false)
    }
  }
  return html`<dialog class="dialog st-edit" data-dialog="edit" ref=${box} aria-labelledby="edit-title-h"
    onCancel=${ev => { ev.preventDefault(); close.current() }}>
    <div class="dialog-head">
      <h2 id="edit-title-h">${T.heading}</h2>
      <span class="st-act" data-action="close-edit"><button type="button" class="icon-btn" aria-label=${T.close} title=${T.close} onClick=${onClose}><${TIcon} name="close" fallback="down" /></button></span>
    </div>
    <div class="dialog-body">
      <form class="new-content" onSubmit=${ev => ev.preventDefault()}>
        <label class="field"><span>${T.titleLabel}</span><input data-field="title" value=${title} onInput=${ev => setTitle(ev.currentTarget.value)} /></label>
        <div class="section-label"><span>${T.topicsLabel}</span></div>
        <div class="filters st-edit__topics" role="group" aria-label=${T.topicsLabel}>
          ${chosen.map(t => html`<span key=${t} class="filter active" data-topic=${t}>${t}
            <button type="button" class="st-edit__x" data-action="remove-topic" aria-label=${fmt(T.removeTopic, { name: t })} onClick=${() => setChosen(list => list.filter(x => x !== t))}>✕</button>
          </span>`)}
          <span class="st-act" data-action="add-topic"><button type="button" class="filter" aria-expanded=${String(adding)} onClick=${() => setAdding(v => !v)}>${T.addTopic}</button></span>
        </div>
        ${adding ? html`<label class="field st-edit__add"><span>${T.addTopicLabel}</span>
          <input data-field="add-topic" list="edit-known-topics" placeholder=${T.addTopicPlaceholder} value=${newTopic} maxlength="100"
            onInput=${ev => setNewTopic(ev.currentTarget.value)} onKeyDown=${ev => { if (ev.key === 'Enter') { ev.preventDefault(); addTopic() } }} />
          <datalist id="edit-known-topics">${known.map(t => html`<option key=${t} value=${t}></option>`)}</datalist>
        </label>` : null}
        ${chosen.length ? null : html`<p class="limit-note" data-part="no-topic" role="alert">${T.noTopic}</p>`}
        <label class="field"><span>${T.bodyLabel}</span>
          <textarea data-field="body" rows="10" value=${body} ref=${bodyRef}
            onInput=${ev => { setBody(ev.currentTarget.value); remember() }} onKeyUp=${remember} onClick=${remember} onSelect=${remember} onBlur=${remember}></textarea></label>
        ${linking ? html`<div class="st-edit__link" data-part="link-search">
          <label class="field"><span>${T.linkSearch}</span><input data-field="link-search" placeholder=${T.linkPlaceholder} value=${linkQuery} onInput=${ev => setLinkQuery(ev.currentTarget.value)} /></label>
          ${linkQuery.trim() && !options.length ? html`<p class="limit-note">${T.linkNone}</p>` : null}
          ${options.map(o => html`<button type="button" key=${o.id} class="file-row" data-link-option=${o.id} onClick=${() => insert(o)}>
            <span class="file-icon"><${TIcon} name="file" /></span><span class="file-text">${fmt(T.linkPick, { title: o.title })}</span></button>`)}
        </div>` : null}
        ${error ? html`<p class="progress-alert" role="alert" data-part="edit-error">${error}</p>` : null}
        <div class="form-footer">
          <span class="st-act" data-action="save-edit"><button type="button" class="btn primary" disabled=${!ready} onClick=${save}>${busy ? T.saving : T.save}</button></span>
          <span class="st-act" data-action="insert-link"><button type="button" class="btn" disabled=${busy} onClick=${() => { remember(); setLinking(v => !v) }}>${T.insertLink}</button></span>
          <span class="st-act" data-action="cancel-edit"><button type="button" class="btn quiet" disabled=${busy} onClick=${onClose}>${T.cancel}</button></span>
          <small data-part="record">${T.record}</small>
        </div>
      </form>
    </div>
  </dialog>`
}
