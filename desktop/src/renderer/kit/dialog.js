// A dialog over the window (a list entry's menu asks its questions in it: a new name, 「移除」 …).
//   html`<${Dialog} name="remove" title=${…} onCancel=${…} actions=${html`<${Button} …/>`}>…the question…<//>`
// Modal: the rest of the window is out of reach while it is open. The focus goes into it when it opens (to the element that has
// `data-dialog-initial`, else the first control), Tab and Shift+Tab stay inside, Esc cancels, a click outside cancels, and the
// focus goes back to where it was when the dialog goes. `title` names it for a screen reader (aria-labelledby).
import { html, useLayoutEffect, useRef } from '../lib/html.js'

let counter = 0
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export function Dialog({ name, title, onCancel, actions, children }) {
  const box = useRef(null)
  const id = useRef(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  if (id.current === null) id.current = `st-dialog-${++counter}`
  // (a layout effect: the focus is in the dialog as it is drawn, and Esc works at once)
  useLayoutEffect(() => {
    const was = document.activeElement
    const el = box.current
    ;(el?.querySelector('[data-dialog-initial]') ?? el?.querySelector(FOCUSABLE))?.focus()
    // Esc cancels wherever the focus is (it may not be in the dialog yet when the key comes)
    const onKey = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancel.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (was && document.contains(was) && typeof was.focus === 'function') was.focus()
    }
  }, [])
  const keyDown = event => {
    if (event.key !== 'Tab') return
    const list = [...box.current.querySelectorAll(FOCUSABLE)]
    if (!list.length) { event.preventDefault(); return }
    const at = list.indexOf(document.activeElement)
    if (event.shiftKey && at <= 0) { event.preventDefault(); list[list.length - 1].focus() }
    else if (!event.shiftKey && (at < 0 || at === list.length - 1)) { event.preventDefault(); list[0].focus() }
  }
  const scrimDown = event => { if (event.target === event.currentTarget) onCancel() }
  return html`<div class="st-dialog__scrim" data-dialog-scrim onMouseDown=${scrimDown}>
    <section class="st-dialog" role="dialog" aria-modal="true" aria-labelledby=${id.current} data-dialog=${name} ref=${box} onKeyDown=${keyDown}>
      <h2 class="st-dialog__title" id=${id.current}>${title}</h2>
      <div class="st-dialog__body">${children}</div>
      <div class="st-dialog__actions">${actions}</div>
    </section>
  </div>`
}
