// A pop-up menu at a point (a list entry's menu: right click, the button at the end of the entry, the menu key).
//   html`<${Menu} label=${…} x=${…} y=${…} items=${[{ id, label, danger }]} onSelect=${id => …} onClose=${({ restoreFocus }) => …} />`
// Reachable from the keyboard: it takes the focus when it opens (the first item); ↓ ↑ move (and wrap), Home and End go to the
// ends, Enter or Space choose, Esc closes and says the focus should go back to where it was, Tab closes (the focus moves on as
// Tab would). A click or a right click anywhere outside closes it. The menu stays inside the window: it opens up or to the left
// when there is no room below or to the right.
import { html, useLayoutEffect, useRef } from '../lib/html.js'

export function Menu({ label, x, y, items, onSelect, onClose }) {
  const box = useRef(null)
  // inside the window (measured before it is painted)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4))
    const top = Math.max(4, y + r.height + 4 > window.innerHeight ? y - r.height : y)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [x, y])
  // the first item has the focus and Esc closes it wherever the focus is — as the menu is drawn, not a frame later (a layout
  // effect: the key may come before the first frame, in a window that is not shown)
  useLayoutEffect(() => {
    box.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus()
    const onKey = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose({ restoreFocus: true })
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  const enabled = () => [...box.current.querySelectorAll('[role="menuitem"]:not([disabled])')]
  const keyDown = event => {
    const list = enabled()
    const at = list.indexOf(document.activeElement)
    const go = i => { event.preventDefault(); list[(i + list.length) % list.length]?.focus() }
    if (event.key === 'ArrowDown') go(at + 1)
    else if (event.key === 'ArrowUp') go(at <= 0 ? list.length - 1 : at - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(list.length - 1)
    else if (event.key === 'Tab') onClose({ restoreFocus: false })
  }
  const outside = event => { event.preventDefault(); onClose({ restoreFocus: false }) }
  return html`<div class="st-menu__scrim" data-menu-scrim onMouseDown=${outside} onContextMenu=${outside}>
    <div class="st-menu" role="menu" aria-label=${label} data-menu ref=${box} onKeyDown=${keyDown}
      style=${{ left: `${x}px`, top: `${y}px` }} onMouseDown=${e => e.stopPropagation()} onContextMenu=${e => { e.preventDefault(); e.stopPropagation() }}>
      ${items.map(item => html`<button key=${item.id} type="button" role="menuitem" class=${item.danger ? 'st-menu__item st-menu__item--danger' : 'st-menu__item'}
        data-menu-item=${item.id} disabled=${item.disabled === true} onClick=${() => onSelect(item.id)}>${item.label}</button>`)}
    </div>
  </div>`
}
