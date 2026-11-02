// The frame of a card (an item waiting in 待看, a notice with a head line): a 4px top edge, a grey head with the
// card's name on the left and its state on the right, a body.
//   tone: 'waiting' (amber edge, amber state — 等你决定) · 'answered' (grey edge, green state with a tick) ·
//         'plain' (no coloured edge)
//   html`<${CardFrame} label=${…} status=${…} tone="waiting" ariaLabel=${…}>…body…<//>`
// What goes inside a confirmation card (its texts, numbers, the user's choice) is the card service's
// (A2 prepareCard / answerCard) and B1's screens; this is only the frame.
import { html } from '../lib/html.js'
import { Icon } from './icons.js'

export function CardFrame({ label, status, tone = 'waiting', ariaLabel, headExtra, children }) {
  const cls = `st-cardframe${tone === 'answered' ? ' st-cardframe--answered' : tone === 'plain' ? ' st-cardframe--plain' : ''}`
  return html`<section class=${cls} aria-label=${ariaLabel ?? label}>
    <div class="st-cardframe__head">
      <span class="st-cardframe__label">${label}</span>
      <span class="st-cardframe__status">
        ${tone === 'answered' && status ? html`<${Icon} name="check" size=${9} />` : null}${status}${headExtra ?? null}
      </span>
    </div>
    <div class="st-cardframe__body">${children}</div>
  </section>`
}
