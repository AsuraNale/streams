// The card of a run that could not start (mockup S13; getHome().problem: a sign-in that expired, no connection chosen, …) —
// what broke, that the fetched items are all kept, how to fix it, and 重试 · 更换 · 复制诊断信息 (with the sign-in loop for a
// command-line connection). Redesign R1: taken out of 概览 (gone) as it was; screens/library-frame.js shows it on top of every
// tab of the library's page, under its tabs (V6; its words and its new place in R2).
// Test hooks: [data-part="problem"][data-code][data-connection-code][data-kind], .today-problem__text,
// [data-action=retry|change|copy|login|login-again].
import { html } from '../lib/html.js'
import { fmt } from '../lib/format.js'
import { Act } from '../lib/action.js'
import { CONNECTIONS } from '../texts/common.js'
import { TODAY as T } from '../texts/today.js'
import { LoginLoop } from './settings.js'

export function ProblemCard({ problem, busy, onRetry, onChange, onCopy, copied, onRedetect }) {
  if (!problem) return null
  const kind = problem.kind ?? null
  const name = kind && Object.hasOwn(CONNECTIONS.names, kind) ? CONNECTIONS.names[kind] : ''
  const code = problem.connectionCode ?? null
  let text
  let fix = null
  if (problem.code === 'connection' && !kind) {
    // no connection chosen: the self-check had nothing to try
    text = fmt(T.problem.connection.none, { n: problem.caughtKept ?? 0 })
    fix = T.problem.fix.none
  } else if (problem.code === 'connection') {
    const known = code && Object.hasOwn(T.problem.connection, code)
    text = fmt(known ? T.problem.connection[code] : T.problem.connection.other, { name, n: problem.caughtKept ?? 0, code })
    const fixKey = ['login-expired', 'not-logged-in'].includes(code) ? 'login' : Object.hasOwn(T.problem.fix, code) ? code : 'other'
    fix = T.problem.fix[fixKey]
  } else {
    text = Object.hasOwn(T.problem, problem.code) && typeof T.problem[problem.code] === 'string' ? T.problem[problem.code] : fmt(T.problem.connection.other, { name, n: problem.caughtKept ?? 0, code: problem.code })
  }
  const loginable = problem.code === 'connection' && ['claude-code', 'codex'].includes(kind) && ['login-expired', 'not-logged-in'].includes(code)
  return html`<section class="progress-alert today-problem" data-part="problem" data-code=${problem.code} data-connection-code=${code ?? ''} data-kind=${kind ?? ''} role="alert" aria-label=${text}>
    <div class="today-problem__text st-t-strong">${text}</div>
    ${fix ? html`<div class="st-t-small st-t-sub">${fix}</div>` : null}
    <div class="today-problem__actions">
      <${Act} name="retry" variant="primary" disabled=${busy} onClick=${onRetry}>${T.problem.retry}<//>
      <${Act} name="change" disabled=${busy} onClick=${onChange}>${T.problem.change}<//>
      <${Act} name="copy" icon="copy" disabled=${busy} onClick=${onCopy}>${T.problem.copy}<//>
      ${copied ? html`<span class="st-t-small st-t-done">${T.problem.copied}</span>` : null}
    </div>
    ${loginable ? html`<${LoginLoop} kind=${kind} busy=${busy} onRedetect=${onRedetect} />` : null}
  </section>`
}
