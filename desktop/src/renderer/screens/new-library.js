// 「新建库」 (v2 package F: the sidebar's 「+ 新建库」, the shelf's 「新建库」 and 「手动新建」): v1.0's way of making or opening a
// library — chooseLibraryFolder (the system's dialog), then useChosenFolder(name): an empty folder becomes a new library, a
// folder with a library is opened, a folder of the user's own .md files is said first and opened as a library on the next
// click (nothing of the user's moved or changed); anything else is refused. The main process registers it and makes it the
// current one (package A); `onOpened(lib)` then takes the page there. Words: texts/shell.js SHELL.newLibrary.
// Test hooks: [data-dialog="new-library"] with input[data-field="library-name"], [data-action=choose-empty|choose-existing|
// import-folder|cancel-new], [data-part="new-note"], [data-part="importable"][data-md-count].
import { html, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { Act } from '../lib/action.js'
import { Dialog } from '../kit/index.js'
import { SHELL } from '../texts/shell.js'

const T = SHELL.newLibrary

export function NewLibraryDialog({ onClose, onOpened }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [importable, setImportable] = useState(null)
  const open = async () => {
    const lib = await call('useChosenFolder', name.trim())
    onOpened(lib)
  }
  const choose = async mode => {
    setBusy(true)
    setNote(null)
    setImportable(null)
    try {
      const r = await call('chooseLibraryFolder')
      if (!r) return
      if (r.state === 'other') { setNote(T.other); return }
      if (mode === 'new' && r.state !== 'empty') { setNote(T.notEmpty); return }
      if (r.state === 'importable') { setImportable(r); return }
      await open()
    } catch { setNote(T.failed) } finally { setBusy(false) }
  }
  const importNow = async () => {
    setBusy(true)
    setNote(null)
    try { await open() } catch { setNote(T.failed) } finally { setBusy(false) }
  }
  const actions = html`<${Act} name="cancel-new" onClick=${onClose}>${T.cancel}<//>`
  return html`<${Dialog} name="new-library" title=${T.title} onCancel=${onClose} actions=${actions}>
    <p class="st-dialog__text">${T.text}</p>
    <label class="newlib__field">
      <span class="st-t-small st-t-sub">${T.name}</span>
      <input class="newlib__input" data-field="library-name" maxlength="100" placeholder=${T.namePlaceholder} value=${name} data-dialog-initial
        onInput=${e => setName(e.currentTarget.value)} />
    </label>
    <div class="newlib__row">
      <${Act} name="choose-empty" variant="primary" icon="plus" disabled=${busy} onClick=${() => choose('new')}>${T.chooseEmpty}<//>
      <${Act} name="choose-existing" icon="folder" disabled=${busy} onClick=${() => choose('open')}>${T.chooseExisting}<//>
    </div>
    ${importable ? html`<div class="newlib__row" data-part="importable" data-md-count=${importable.mdCount ?? ''}>
      <span class="st-t-small st-t-sub">${fmt(T.importable, { n: importable.mdCount ?? '' })}</span>
      <${Act} name="import-folder" variant="primary" disabled=${busy} onClick=${importNow}>${T.importNow}<//>
    </div>` : null}
    ${note ? html`<div class="st-dialog__error" role="alert" data-part="new-note">${note}</div>` : null}
  <//>`
}
