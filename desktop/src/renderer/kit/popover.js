// A pop-up anchored to an element. Like the dialog (kit/dialog.js) in how it
// behaves with the keyboard, without taking over the window:
//   html`<${Popover} name="details" label=${…} anchor=${ref} onClose=${…}>…<//>`
// It opens next to the anchor (to its right, its bottom edge level with the anchor's; to the left or higher when there is no
// room), inside the window — placed again whenever it is drawn again (its content changed). With `place="below"` (the research
// chip on a top line) it opens under the anchor, its left edge level with the anchor's
// (moved left to stay inside the window), and above the anchor when there is no room below. The focus goes into it when it opens (the element with `data-popover-initial`, else the first
// control), Tab and Shift+Tab stay inside, Esc closes it, a click outside closes it, and the focus goes back to the anchor
// when it goes. `label` names it for a screen reader.
import { html, useLayoutEffect, useRef } from '../lib/html.js'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
const GAP = 8

export function Popover({ name, label, anchor, onClose, place: where = 'beside', children }) {
  const box = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  const placeNow = useRef(null)
  // placed and focused as it is drawn (a layout effect: Esc works at once, even in a window that is not shown)
  useLayoutEffect(() => {
    const was = document.activeElement
    const el = box.current
    const place = () => {
      const a = anchor?.current?.getBoundingClientRect?.()
      if (!a || !el) return
      const r = el.getBoundingClientRect()
      let left
      let top
      if (where === 'below') {
        left = Math.max(GAP, Math.min(a.left, window.innerWidth - r.width - GAP))
        top = a.bottom + GAP
        if (top + r.height + GAP > window.innerHeight) top = Math.max(GAP, a.top - r.height - GAP)
      } else {
        left = a.right + GAP
        if (left + r.width + GAP > window.innerWidth) left = Math.max(GAP, a.left - r.width - GAP)
        top = Math.max(GAP, Math.min(a.bottom - r.height, window.innerHeight - r.height - GAP))
      }
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    }
    placeNow.current = place
    place()
    ;(el?.querySelector('[data-popover-initial]') ?? el?.querySelector(FOCUSABLE))?.focus()
    const onKey = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close.current()
    }
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', place)
      const back = anchor?.current ?? was
      if (back && document.contains(back) && typeof back.focus === 'function') back.focus()
    }
  }, [])
  // placed again after every later drawing: what it holds may have grown or shrunk while open (a read ended: the low or the
  // unreadable notice came or went), and its bottom must stay inside the window
  useLayoutEffect(() => { placeNow.current?.() })
  const keyDown = event => {
    if (event.key !== 'Tab') return
    const list = [...box.current.querySelectorAll(FOCUSABLE)]
    if (!list.length) { event.preventDefault(); return }
    const at = list.indexOf(document.activeElement)
    if (event.shiftKey && at <= 0) { event.preventDefault(); list[list.length - 1].focus() }
    else if (!event.shiftKey && (at < 0 || at === list.length - 1)) { event.preventDefault(); list[0].focus() }
  }
  const scrimDown = event => { if (event.target === event.currentTarget) onClose() }
  return html`<div class="st-popover__scrim" data-popover-scrim onMouseDown=${scrimDown} onContextMenu=${scrimDown}>
    <section class="st-popover" role="dialog" aria-label=${label} data-popover=${name} data-place=${where} ref=${box} onKeyDown=${keyDown}>
      ${children}
    </section>
  </div>`
}
