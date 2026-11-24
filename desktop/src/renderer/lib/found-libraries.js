// 1.1.1 P11b (A15; 场景六②): after the app's data was removed, or on another computer — the libraries already in the place new
// ones go (新建库默认存储位置) are listed on 首次打开 and on the shelf with no library: 「找到 n 座已有的库」, each with 「加回」, and
// 「全部加回」. Nothing is registered until the user presses one; the main process reads only their names and takes back only
// the paths it just listed (findLibraries / addFoundLibraries). After adding: that library's 待看.
//   html`<${FoundLibraries} />`      nothing at all when none is found
// Words: texts/shell.js SHELL.found. Test hooks: [data-part="found-libraries"][data-count], [data-found=<path>],
// [data-action="found-add"], [data-action="found-add-all"], [data-part="found-note"].
import { html, useEffect, useState } from './html.js'
import { useApp } from './app-context.js'
import { call } from './bridge.js'
import { fmt } from './format.js'
import { SHELL } from '../texts/shell.js'

const W = SHELL.found

export function FoundLibraries() {
  const { appState, libraries, navigate } = useApp()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    call('findLibraries').then(r => { if (live) setList(Array.isArray(r) ? r : []) }).catch(() => { if (live) setList([]) })
    return () => { live = false }
  }, [])
  if (!list || list.length === 0) return null
  const add = async paths => {
    setBusy(true)
    setFailed(false)
    try {
      const lib = await call('addFoundLibraries', paths)
      appState?.mutate?.(d => ({ ...d, library: lib, libraryCount: Math.max(paths.length, d?.libraryCount ?? 0) }))
      libraries?.reload?.()
      navigate('inbox')
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }
  return html`<section class="panel-section st-found" data-part="found-libraries" data-count=${list.length}>
    <div class="section-label"><span>${fmt(W.title, { n: list.length })}</span>
      ${list.length > 1 ? html`<span class="st-act" data-action="found-add-all"><button type="button" class="btn primary" disabled=${busy} onClick=${() => add(list.map(l => l.path))}>${W.addAll}</button></span>` : null}
    </div>
    <p class="limit-note">${W.lead}</p>
    ${list.map(l => html`<div key=${l.path} class="file-row" data-found=${l.path}>
      <span class="file-text">${l.name}<small class="st-path">${l.path}</small></span>
      <span class="st-act" data-action="found-add"><button type="button" class="btn" disabled=${busy} onClick=${() => add([l.path])}>${W.add}</button></span>
    </div>`)}
    ${failed ? html`<p class="progress-alert" role="alert" data-part="found-note">${W.failed}</p>` : null}
  </section>`
}
