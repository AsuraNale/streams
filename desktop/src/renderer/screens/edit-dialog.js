// 编辑一条 (mockup S7; docs/desktop.md §4.2): a dialog over 资料库 that changes four things only — the title, the topics,
// the body, and the [[links]], which live in the body. The topics are tags with ×, and 「+ 加主题」 picks from the library's
// own topics (streams.json, through getSources). 「插入 [[链接]]…」 searches the library (searchLibrary) and puts
// `[[<title>]]` where the cursor is in the body. The source, the dates and the scores are a record: not here. 「保存」
// sends only what changed (editNote: `title` / `topics` / `body`), then the dialog closes and the screen reads again.
// Words: texts/library.js EDIT.
// Test hooks: [data-dialog="edit"], input[data-field="title"], [data-topic=<name>] with [data-action="remove-topic"],
// select[data-field="add-topic"], textarea[data-field="body"], [data-action=insert-link|save-edit|cancel-edit],
// input[data-field="link-search"], [data-link-option=<id>], [data-part="edit-error"].
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { Act } from '../lib/action.js'
import { Dialog, Icon } from '../kit/index.js'
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
  const [linking, setLinking] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [options, setOptions] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const bodyRef = useRef(null)
  const caret = useRef(null)

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

  const addable = (topics ?? []).filter(t => !chosen.includes(t))
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
  const actions = html`<${Act} name="cancel-edit" disabled=${busy} onClick=${onClose}>${T.cancel}<//>
    <${Act} name="save-edit" variant="primary" disabled=${!ready} onClick=${save}>${busy ? T.saving : T.save}<//>`
  return html`<${Dialog} name="edit" title=${T.heading} onCancel=${onClose} actions=${actions}>
    <label class="st-dialog__label" for="edit-title">${T.titleLabel}</label>
    <input id="edit-title" class="st-dialog__input" data-field="title" value=${title} data-dialog-initial onInput=${ev => setTitle(ev.currentTarget.value)} />
    <span class="st-dialog__label">${T.topicsLabel}</span>
    <div class="edit-topics" role="group" aria-label=${T.topicsLabel}>
      ${chosen.map(t => html`<span key=${t} class="edit-topic" data-topic=${t}>${t}
        <button type="button" class="edit-topic__x" data-action="remove-topic" aria-label=${fmt(T.removeTopic, { name: t })} onClick=${() => setChosen(list => list.filter(x => x !== t))}><${Icon} name="close" size=${10} /></button>
      </span>`)}
      <select class="edit-topics__add" data-field="add-topic" aria-label=${T.addTopic} value="" disabled=${!addable.length}
        onChange=${ev => { const v = ev.currentTarget.value; if (v) setChosen(list => (list.includes(v) ? list : [...list, v])); ev.currentTarget.value = '' }}>
        <option value="">${T.addTopic}</option>
        ${addable.map(t => html`<option key=${t} value=${t}>${t}</option>`)}
      </select>
    </div>
    ${chosen.length ? null : html`<div class="st-dialog__error" data-part="no-topic">${T.noTopic}</div>`}
    <label class="st-dialog__label" for="edit-body">${T.bodyLabel}</label>
    <textarea id="edit-body" class="edit-body" data-field="body" rows="12" value=${body} ref=${bodyRef}
      onInput=${ev => { setBody(ev.currentTarget.value); remember() }} onKeyUp=${remember} onClick=${remember} onSelect=${remember} onBlur=${remember}></textarea>
    <div class="edit-link">
      <${Act} name="insert-link" disabled=${busy} onClick=${() => { remember(); setLinking(v => !v) }}>${T.insertLink}<//>
      ${linking ? html`<div class="edit-link__search" data-part="link-search">
        <label class="st-dialog__label" for="edit-link-q">${T.linkSearch}</label>
        <input id="edit-link-q" class="st-dialog__input" data-field="link-search" placeholder=${T.linkPlaceholder} value=${linkQuery} onInput=${ev => setLinkQuery(ev.currentTarget.value)} />
        ${linkQuery.trim() && !options.length ? html`<div class="st-t-small st-t-muted">${T.linkNone}</div>` : null}
        <ul class="edit-link__options">
          ${options.map(o => html`<li key=${o.id}><button type="button" class="edit-link__option" data-link-option=${o.id} onClick=${() => insert(o)}>${fmt(T.linkPick, { title: o.title })}</button></li>`)}
        </ul>
      </div>` : null}
    </div>
    <p class="st-t-small st-t-muted" data-part="record">${T.record}</p>
    ${error ? html`<div class="st-dialog__error" role="alert" data-part="edit-error">${error}</div>` : null}
  <//>`
}
