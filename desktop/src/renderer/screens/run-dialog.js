// 跑一轮 (mockup S12): the dialog 今日 opens before a round. What it is going to do comes from estimateRound (+ the
// connection the main process adds); 「开始」 = startRound, 「改上限」 = an inline number → setRoundCap. Words: texts/run.js.
// Test hooks: [data-dialog="run"], [data-row=fetch|items|calls|using|cap], [data-field="cap"], [data-action=start|cancel|change-cap|save-cap].
import { html, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { Act } from '../lib/action.js'
import { Dialog } from '../kit/index.js'
import { CONNECTIONS } from '../texts/common.js'
import { RUN as T } from '../texts/run.js'

/**
 * @param {object} p
 * @param {() => void} p.onClose
 * @param {(r: object) => void} [p.onStarted] - startRound answered { started: true, roundId }
 * @param {(r: object) => void} [p.onNotStarted] - startRound answered { started: false, problems } (今日 shows the card)
 */
export function RunDialog({ onClose, onStarted, onNotStarted }) {
  const est = useLoad(() => call('estimateRound'), [])
  const [editing, setEditing] = useState(false)
  const [cap, setCap] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const d = est.data
  const saveCap = async () => {
    const n = Number(cap)
    if (!/^\d+$/.test(cap.trim()) || !Number.isInteger(n) || n <= 0) { setError(T.capBad); return }
    setBusy(true)
    setError(null)
    try {
      await call('setRoundCap', n)
      setEditing(false)
      est.reload()
    } catch { setError(T.capBad) } finally { setBusy(false) }
  }
  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await call('startRound')
      if (r.started) onStarted?.(r)
      else onNotStarted?.(r)
      onClose()
    } catch { setError(T.failed); setBusy(false) }
  }
  const c = d?.connection ?? null
  const using = c && c.kind
    ? fmt(T.rows.usingValue, { name: CONNECTIONS.names[c.kind] ?? c.kind, model: c.model ?? CONNECTIONS.defaultModel, verify: c.verifyModel ?? CONNECTIONS.sameAsMain })
    : T.rows.usingNone
  const actions = html`<${Act} name="change-cap" disabled=${busy || !d} onClick=${() => { setEditing(e => !e); setCap(String(d?.cap ?? '')); setError(null) }}>${T.changeCap}<//>
    <${Act} name="cancel" disabled=${busy} onClick=${onClose}>${T.cancel}<//>
    <${Act} name="start" variant="primary" disabled=${busy || !d} onClick=${start}>${T.start}<//>`
  return html`<${Dialog} name="run" title=${T.title} onCancel=${onClose} actions=${actions}>
    <div class="run-dialog" data-state=${est.status}>
      <div class="st-t-small st-t-sub st-t-strong">${T.heading}</div>
      ${d ? html`<dl class="run-rows">
        <div class="run-row" data-row="fetch"><dt>${T.rows.fetch}</dt><dd>${fmt(T.rows.fetchValue, { n: d.sources, paused: d.paused })}</dd></div>
        <div class="run-row" data-row="items"><dt>${T.rows.items}</dt><dd>${d.recentRounds > 0 ? fmt(T.rows.itemsValue, { lo: d.expectedItems?.[0], hi: d.expectedItems?.[1], rounds: d.recentRounds }) : T.rows.itemsNone}</dd></div>
        <div class="run-row" data-row="calls"><dt>${T.rows.calls}</dt><dd>${fmt(T.rows.callsValue, { lo: d.expectedCalls?.[0], hi: d.expectedCalls?.[1] })}</dd></div>
        <div class="run-row" data-row="using"><dt>${T.rows.using}</dt><dd>${using}</dd></div>
        <div class="run-row" data-row="cap"><dt>${T.rows.cap}</dt><dd data-cap=${d.cap}>${fmt(T.rows.capValue, { cap: d.cap })}</dd></div>
      </dl>` : est.status === 'error' ? html`<div class="run-error">${T.loadFailed}</div>` : null}
      ${editing ? html`<div class="run-cap" data-part="cap-editor">
        <label class="st-t-small st-t-sub" for="run-cap">${T.capLabel}</label>
        <input id="run-cap" class="run-field" type="number" min="1" step="1" data-field="cap" value=${cap} data-dialog-initial onInput=${e => setCap(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); saveCap() } }} />
        <${Act} name="save-cap" disabled=${busy} onClick=${saveCap}>${T.saveCap}<//>
      </div>` : null}
      ${error ? html`<div class="run-error" role="alert">${error}</div>` : null}
      <p class="st-t-small st-t-muted">${T.note}</p>
    </div>
  <//>`
}
