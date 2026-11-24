// 1.1 W13 (维护者 11-23「发之前先补」): 「打开已有的库」 — the library shelf's toolbar, the shelf with no library, and 首次打开's
// footer. One flow for the three (app.js openExisting): the system's folder dialog (chooseLibraryFolder); a folder that holds
// a Streams library → registered once and made current (addLibrary), then its 待看; cancelled → nothing changes; any other
// folder (empty, only .md files, anything else) → one line saying it holds no library, nothing registered and nothing written
// in that folder (1.1 has one kind of library: no import of a folder of .md files here, no library made here).
//   const { open, busy, note } = useOpenExisting()     note: null | 'not-library' | 'failed'
//   html`<${OpenExistingNote} note=${note} />`        the line, or nothing
// Words: texts/shell.js SHELL.openExisting. Test hooks: [data-action="open-existing"], [data-part="open-existing-note"][data-note].
import { html, useState } from './html.js'
import { useApp } from './app-context.js'
import { SHELL } from '../texts/shell.js'

const W = SHELL.openExisting

export function useOpenExisting() {
  const { openExisting } = useApp()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const open = async () => {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      const r = await openExisting()
      if (r === 'not-library') setNote('not-library')
    } catch (err) {
      console.warn(`openExisting: ${err?.code ?? err}`)
      setNote('failed')
    } finally {
      setBusy(false)
    }
  }
  return { open, busy, note }
}

export function OpenExistingNote({ note }) {
  if (!note) return null
  return html`<p class="limit-note st-open-existing-note" role="alert" data-part="open-existing-note" data-note=${note}>${note === 'not-library' ? W.notLibrary : W.failed}</p>`
}
