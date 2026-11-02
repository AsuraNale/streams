// Buttons, 40px high (04 §二).
//   variant: 'primary' (accent, white, bold) · 'secondary' (white, grey border; default)
//   icon: an Icon name, drawn before the words · wide: 24px side padding · disabled
//   html`<${Button} variant="primary" icon="plus" onClick=${…}>${TEXT.newProject}<//>`
// LinkButton: words that look like a link but act as a button.
import { html } from '../lib/html.js'
import { Icon } from './icons.js'

export function Button({ variant = 'secondary', icon, wide = false, disabled = false, type = 'button', onClick, label, children }) {
  const cls = ['st-button', variant === 'primary' ? 'st-button--primary' : null, wide ? 'st-button--wide' : null].filter(Boolean).join(' ')
  return html`<button type=${type} class=${cls} disabled=${disabled} aria-label=${label} onClick=${onClick}>
    ${icon ? html`<${Icon} name=${icon} strokeWidth=${icon === 'plus' ? 2.2 : undefined} />` : null}${children}
  </button>`
}

export function LinkButton({ onClick, children }) {
  return html`<button type="button" class="st-link-button" onClick=${onClick}>${children}</button>`
}
