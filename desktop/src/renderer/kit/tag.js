// Small labels.
//   tone: 'wait' (等你决定, amber) · 'done' (已交付, green) · 'recommend' (推荐, accent, small)
//   html`<${Tag} tone="wait">${fmt(TEXT.pendingTag, { n })}<//>`
// Notice: a box for a short message. tone: 'wait' (amber, 等你) · 'plain' (grey, 12px).
import { html } from '../lib/html.js'

export function Tag({ tone = 'wait', children }) {
  return html`<span class=${`st-tag st-tag--${tone}`}>${children}</span>`
}

export function Notice({ tone = 'plain', role, children, class: extra }) {
  return html`<div class=${`st-notice st-notice--${tone}${extra ? ` ${extra}` : ''}`} role=${role}>${children}</div>`
}
