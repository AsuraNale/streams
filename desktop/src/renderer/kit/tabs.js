// Tabs across the top of the right panel.
//   html`<${PanelTabs} label=${PANEL.label} current="progress" onSelect=${id => …}
//          items=${[{ id: 'progress', label: PANEL.tabs.progress }, …]} />`
import { html } from '../lib/html.js'

export function PanelTabs({ label, items, current, onSelect }) {
  return html`<nav class="st-tabs" aria-label=${label}>
    ${items.map(item => html`<button type="button" key=${item.id} class="st-tabs__tab"
      aria-current=${item.id === current ? 'true' : undefined}
      onClick=${() => onSelect?.(item.id)}>${item.label}</button>`)}
  </nav>`
}
