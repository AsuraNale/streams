// Buttons — redesign R1: the template's `.btn` (`.btn.primary` the accent one, `.btn.quiet` the quiet one); `st-button` /
// `st-button--primary` stay on them as hooks only (no style of their own any more).
//   variant: 'primary' · 'secondary' (default) · 'quiet'
//   icon: an Icon name, drawn before the words · wide: the full width · disabled
//   html`<${Button} variant="primary" icon="plus" onClick=${…}>${TEXT.newProject}<//>`
// LinkButton: words that look like a link but act as a button.
import { html } from '../lib/html.js'
import { Icon } from './icons.js'

export function Button({ variant = 'secondary', icon, wide = false, disabled = false, type = 'button', onClick, label, children }) {
  const cls = ['btn', 'st-button', variant === 'primary' ? 'primary st-button--primary' : null, variant === 'quiet' ? 'quiet' : null, wide ? 'st-button--wide' : null].filter(Boolean).join(' ')
  return html`<button type=${type} class=${cls} disabled=${disabled} aria-label=${label} onClick=${onClick}>
    ${icon ? html`<${Icon} name=${icon} strokeWidth=${icon === 'plus' ? 2.2 : undefined} />` : null}${children}
  </button>`
}

export function LinkButton({ onClick, children }) {
  return html`<button type="button" class="st-link-button" onClick=${onClick}>${children}</button>`
}
