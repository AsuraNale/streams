// The bar at the top of a page — redesign R1: the template's parts.
//   html`<${TopBar} title=${…} subtitle=${…} titleTag="h1" actions=${html`<${Button}…/>`} />`
// titleTag 'h1' (a page of its own: 库架, 主 Agent, 设置 …): the template's work-header — `.project-heading` (h1, `.header-meta`)
// and `.header-actions`. Any other titleTag (a tab of a library's page, under the library's own head): the template's
// `.section-label` line — the title, the line under it, the actions on the right.
import { h, html } from '../lib/html.js'

export function TopBar({ title, subtitle, titleTag = 'div', titleId, actions, children }) {
  if (titleTag === 'h1') {
    return html`<header class="work-header st-topbar">
      <div class="project-heading st-topbar__text">
        ${h('h1', { class: 'st-topbar__title', id: titleId }, title)}
        ${subtitle || children ? html`<div class="header-meta st-topbar__subtitle">${subtitle ? html`<span>${subtitle}</span>` : null}${children}</div>` : null}
      </div>
      ${actions ? html`<div class="header-actions">${actions}</div>` : null}
    </header>`
  }
  return html`<header class="section-label st-subbar st-topbar">
    <div class="st-subbar__text st-topbar__text">
      ${h(titleTag, { class: 'st-subbar__title st-topbar__title', id: titleId }, title)}
      ${subtitle ? html`<small class="st-topbar__subtitle">${subtitle}</small>` : null}
      ${children}
    </div>
    ${actions ? html`<div class="st-subbar__actions">${actions}</div>` : null}
  </header>`
}
