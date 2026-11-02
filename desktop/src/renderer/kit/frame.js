// The frame every screen sits in: sidebar (232px) · main · right panel (404px, optional), 12px gutters.
//
//   html`<${AppFrame} sidebar=${…} panel=${…}>
//     <${Main} screen="home" state=${status} labelledby="…">
//       <${TopBar} … />
//       <div class="st-main__body my-screen-body">…</div>
//     <//>
//   <//>`
//
// Without `panel` the frame has two columns; with it, three.
// `screen` and `state` become data-screen / data-state on <main>: tests wait for data-state="ready".
import { html } from '../lib/html.js'

export function AppFrame({ sidebar, panel, children }) {
  return html`<div class=${panel ? 'st-frame st-frame--panel' : 'st-frame'}>
    ${sidebar}
    ${children}
    ${panel ?? null}
  </div>`
}

export function Main({ screen, state, label, labelledby, children }) {
  return html`<main class="st-main" data-screen=${screen} data-state=${state} aria-label=${label} aria-labelledby=${labelledby}>
    ${children}
  </main>`
}

/** The right panel: optional tabs (PanelTabs) on top, then a scrolling body. */
export function Panel({ label, labelledby, tabs, children }) {
  return html`<aside class="st-panel" aria-label=${label} aria-labelledby=${labelledby}>
    ${tabs ?? null}
    <div class="st-panel__body">${children}</div>
  </aside>`
}
