// The frame every screen sits in — redesign R1: the template's three columns (the design's streams/app.js): `.app` with the
// sidebar (`aside.sidebar`), the work area and the right panel (`aside.context-panel`, screens/right-panel.js). The widths are
// the template's (--left 232px · --right 380px); a folded right panel is a 52px rail (`.app.st-folded`, styles/template-app.css).
//
//   html`<${AppFrame} sidebar=${…} panel=${…} folded=${…}>
//     <${Main} screen="shelf" state=${status} labelledby="…">
//       <${TopBar} titleTag="h1" … />           the template's work-header
//       <div class="st-main__body my-screen-body">…</div>
//     <//>
//   <//>`
//
// Main is the template's `main.workspace` (a page of its own), or — `inner` — the `section.center` under a library's head and
// tabs (screens/library-frame.js). `screen` and `state` become data-screen / data-state on <main>: tests wait for
// data-state="ready".
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'

export function AppFrame({ sidebar, panel, children }) {
  const app = useApp()
  // the right panel folded (settings.json panel.open false): the third column is the rail
  const folded = Boolean(panel) && app?.appState?.data?.panel?.open === false
  return html`<div class=${`app st-frame${panel ? ' st-frame--panel' : ' st-frame--no-panel'}${folded ? ' st-folded' : ''}`}>
    ${sidebar}
    ${children}
    ${panel ?? null}
  </div>`
}

export const SKELETON_AFTER_MS = 300
/** true once `on` has stayed true for `ms` (false again as soon as it is not). */
function useLate(on, ms) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!on) { setLate(false); return undefined }
    const t = setTimeout(() => setLate(true), ms)
    return () => clearTimeout(t)
  }, [on])
  return on && late
}

export function Main({ screen, state, label, labelledby, inner = false, attrs = null, children }) {
  // 1.1.1 P14 (M7): still loading after 300 ms → grey blocks with a light over them (none before: no flash)
  const late = useLate(state === 'loading', SKELETON_AFTER_MS)
  // attrs (1.1 W6b): more data-* attributes of the screen (新建库's data-mode, data-view)
  return html`<main class=${inner ? 'center st-main' : 'workspace st-main'} data-screen=${screen} data-state=${state} aria-label=${label} aria-labelledby=${labelledby} ...${attrs ?? {}}>
    ${late ? html`<div class="st-skeleton" data-part="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>` : null}
    ${children}
  </main>`
}

/** A side panel of a screen of its own (the component gallery): optional tabs on top, then a scrolling body. */
export function Panel({ label, labelledby, tabs, children }) {
  return html`<aside class="context-panel st-panel" aria-label=${label} aria-labelledby=${labelledby}>
    ${tabs ?? null}
    <div class="panel-scroll st-panel__body">${children}</div>
  </aside>`
}
