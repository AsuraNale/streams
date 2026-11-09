// 首次打开 (v2 package I, contract I1; design UC1; docs/desktop.md §五「首次打开」): what app.js shows while the app knows no library
// at all (getAppState().libraryCount === 0 — not v1.0's 「no library open」: libraries registered with none current go to 库架).
// Two steps in a sidebar of its own (screens/new-library.js WizardSidebar):
//   1. 连接方式 — v1.0's connection step: three cards from getConnections (detection, the recommended one, the login loop, the key
//      dialog), 「用这一条」 = setActiveConnection + one probe, 「这一步先跳过」. Who decided it: recordSetupStep('connection', …) —
//      with no library yet the main process writes it into settings.json's setupConnection (chose + the kind, or skipped); the
//      first library 新建库 makes copies it into its own setup.
//   2. 想追踪什么 — the app itself: onDone() leaves this screen for 和主 Agent 聊 (screens/chat.js), whose guide (three example
//      sentences that only fill the input, 「也可以手动新建」 → 新建库) shows while the app knows no library.
// The connection card's pieces (the detection line, the login loop, the probe line, the key dialog) are shared with 设置
// (screens/settings.js). Words: texts/first-run.js and texts/common.js CONNECTIONS.
// Test hooks: main[data-screen="first-run"][data-state], .fr-body[data-step="connection"] and [data-part="step-connection"], the
// sidebar's [data-step][data-step-state], [data-action=use|next|skip|redetect|set-key|login|login-again],
// [data-connection=<kind>][data-selected][data-conn-state].
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { AppFrame, Main, Tag, TopBar } from '../kit/index.js'
import { CONNECTIONS, ERRORS } from '../texts/common.js'
import { FIRST_RUN as T } from '../texts/first-run.js'
import { ApiKeyDialog, LoginLoop, ProbeLine, connectionState, detectWords, needsLogin, probeView } from './settings.js'
import { WizardSidebar, recordStep } from './new-library.js'

/** 首次打开's two steps: the connection here, then what to follow (和主 Agent 聊). */
export const FIRST_RUN_STEPS = Object.freeze(['connection', 'track'])
const KINDS = ['claude-code', 'codex', 'api']

/** The connection: three cards from getConnections; 「用这一条」 = setActiveConnection + one probe. */
export function ConnectionStep({ onNext, onSkip, onBack, onState, busy: leaving = false }) {
  const conns = useLoad(() => call('getConnections'), [])
  useEffect(() => onState(conns.status), [conns.status])
  useEvent('connections-changed', () => conns.reload())
  const [working, setBusy] = useState(false)
  const busy = working || leaving
  const [probes, setProbes] = useState({})
  const [keyDialog, setKeyDialog] = useState(false)
  const data = conns.data
  const redetect = async () => {
    setBusy(true)
    try { const d = await call('detectConnections'); conns.mutate(() => d) } catch { /* the cards keep what they had */ } finally { setBusy(false) }
  }
  const use = async kind => {
    setBusy(true)
    setProbes(p => ({ ...p, [kind]: { status: 'trying' } }))
    try {
      await call('setActiveConnection', kind)
      conns.mutate(d => ({ ...d, active: kind }))
      const r = await call('probeConnection', kind)
      setProbes(p => ({ ...p, [kind]: { status: r.ok ? 'ok' : 'failed', result: r } }))
    } catch { setProbes(p => ({ ...p, [kind]: { status: 'failed', result: { code: 'unknown' } } })) } finally { setBusy(false) }
  }
  if (!data) {
    return html`<div class="fr-step"><h2 class="st-t-heading">${T.connection.heading}</h2>${conns.status === 'error' ? html`<div class="fr-error">${ERRORS.failed}</div>` : null}</div>`
  }
  return html`<div class="fr-step">
    <h2 class="st-t-heading">${T.connection.heading}</h2>
    <p class="st-t-sub">${T.connection.lead}</p>
    <div class="fr-cards">
      ${KINDS.map(kind => {
        const k = data.kinds?.[kind] ?? {}
        const selected = data.active === kind
        const usable = connectionState(kind, k) === 'usable'
        return html`<section key=${kind} class=${`fr-card${selected ? ' fr-card--selected' : ''}`} data-connection=${kind} data-selected=${String(selected)} data-conn-state=${connectionState(kind, k)} aria-label=${CONNECTIONS.names[kind]}>
          <div class="fr-card__head">
            <span class="st-t-title">${CONNECTIONS.names[kind]}</span>
            ${data.recommended === kind ? html`<${Tag} tone="recommend">${CONNECTIONS.recommended}<//>` : null}
          </div>
          <div class="st-t-small st-t-sub" data-detect>${detectWords(kind, k)}</div>
          <div class="st-t-small st-t-muted">${T.connection.hints[kind]}</div>
          ${needsLogin(kind, k) ? html`<${LoginLoop} kind=${kind} busy=${busy} onRedetect=${redetect} />` : null}
          ${kind === 'api' && !k.hasKey ? html`<div><${Act} name="set-key" disabled=${busy} onClick=${() => setKeyDialog(true)}>${T.connection.setKey}<//></div>` : null}
          <div class="fr-card__foot">
            ${selected
              ? html`<span class="st-t-small st-t-done st-t-strong" data-chosen>${T.connection.chosen}</span>`
              : html`<${Act} name="use" disabled=${busy || !usable} onClick=${() => use(kind)}>${T.connection.use}<//>`}
            <${ProbeLine} probe=${probes[kind] ?? probeView(data.probes?.[kind])} />
          </div>
        </section>`
      })}
    </div>
    <div class="fr-actions">
      <${Act} name="redetect" disabled=${busy} onClick=${redetect}>${T.connection.redetect}<//>
      <${Act} name="skip" disabled=${busy} onClick=${onSkip}>${T.connection.skip}<//>
      <span class="fr-actions__spacer"></span>
      ${onBack ? html`<${Act} name="back" disabled=${busy} onClick=${onBack}>${T.back}<//>` : null}
      <${Act} name="next" variant="primary" disabled=${busy || !data.active} onClick=${() => onNext(data.active)}>${T.next}<//>
    </div>
    ${keyDialog ? html`<${ApiKeyDialog} api=${data.kinds?.api ?? {}} onClose=${() => setKeyDialog(false)} onChanged=${redetect} />` : null}
  </div>`
}


/**
 * 首次打开. `onDone()` (app.js) takes the app to 和主 Agent 聊, the second step; without it (opened by id in development) the
 * page goes there itself.
 */
export function FirstRunScreen({ onDone }) {
  const { navigate } = useApp()
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  // the connection step walked through: its record first (settings.json while there is no library), then 和主 Agent 聊
  const next = async (by, kind) => {
    setBusy(true)
    await recordStep('connection', by, kind)
    if (typeof onDone === 'function') onDone('chat')
    else navigate('chat')
  }
  return html`<${AppFrame} sidebar=${html`<${WizardSidebar} label=${T.title} steps=${FIRST_RUN_STEPS} step=${0} />`}>
    <${Main} screen="first-run" state=${state} labelledby="fr-title">
      <${TopBar} title=${T.title} subtitle=${T.steps.connection} titleTag="h1" titleId="fr-title" />
      <div class="st-main__body fr-body" data-part="step-connection" data-step="connection">
        <${ConnectionStep} onState=${setState} busy=${busy} onNext=${kind => next('chose', kind)} onSkip=${() => next('skipped')} />
      </div>
    <//>
  <//>`
}
