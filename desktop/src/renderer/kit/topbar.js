// The bar at the top of the main area: title, a line under it, and anything on the right (buttons, a tag).
//   html`<${TopBar} title=${…} subtitle=${…} titleTag="h1" actions=${html`<${Button}…/>`} />`
// `titleTag` is 'div' by default; the screen's one main heading uses 'h1'.
import { h, html } from '../lib/html.js'

export function TopBar({ title, subtitle, titleTag = 'div', titleId, actions, children }) {
  return html`<header class="st-topbar">
    <div class="st-topbar__text">
      ${h(titleTag, { class: 'st-topbar__title', id: titleId }, title)}
      ${subtitle ? html`<div class="st-topbar__subtitle">${subtitle}</div>` : null}
      ${children}
    </div>
    ${actions ?? null}
  </header>`
}
