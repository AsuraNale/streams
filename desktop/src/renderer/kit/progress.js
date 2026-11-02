// The small-square progress (8px squares: done solid · in progress accent dashed · waiting for you amber outline ·
// not reached light grey). The pipeline page (plan C5) draws a round's steps with it.
//   Steps          one row of squares: [{ key, state }] with state 'done' | 'active' | 'awaiting' | 'todo'
//   StageProgress  a row of stages, each its name over its squares: [{ id, name, current, steps }]
//   stepClass      the classes of one step, for other shapes (bars: `st-step--bar`)
// `past`: done squares of a stage that is not the current one are grey.
import { html } from '../lib/html.js'

export function stepClass(state, { past = false, bar = false } = {}) {
  const tone = state === 'done' ? (past ? 'done-past' : 'done') : ['active', 'awaiting', 'todo'].includes(state) ? state : 'todo'
  return `st-step st-step--${tone}${bar ? ' st-step--bar' : ''}`
}

export function Steps({ steps, past = false }) {
  return html`<span class="st-steps">
    ${steps.map(s => html`<span key=${s.key} class=${stepClass(s.state, { past })} data-step=${s.key} data-state=${s.state}></span>`)}
  </span>`
}

/** stages: [{ id, name, current, steps }]; label: the whole row in words (screen readers). Stages without steps are not drawn. */
export function StageProgress({ stages, label }) {
  return html`<div class="st-stagerow" role="img" aria-label=${label}>
    ${stages.filter(s => s.steps.length).map(s => html`<div key=${s.id} class="st-stagerow__stage" data-stage=${s.id}>
      <span class=${s.current ? 'st-stagerow__name st-stagerow__name--current' : 'st-stagerow__name'}>${s.name}</span>
      <${Steps} steps=${s.steps} past=${!s.current} />
    </div>`)}
  </div>`
}
