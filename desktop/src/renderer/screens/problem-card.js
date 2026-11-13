// The banner of a run that could not start — redesign R2 (P08, F20, V6): one at most, on top of every tab of a library's page
// (screens/library-frame.js), and only for a run whose self-check did not pass (getHome().problem: the sign-in expired, no
// connection chosen, the connection not there, the folder not writable …). The source problems and 「连续 n 次运行无内容进入
// 待看」 are no banner: they are cards in the right panel's 待确认 (R1). The template's progress-alert:
//   one sentence of what happened, with 「抓到的 n 条都在，没丢」 (problem.caughtKept: the fetched items kept), one of what to
//   do, at most three buttons — the sign-in expired (or never done) on a command-line tool: 前往登录 (openLogin) · 已登录，重试
//   (detect again, then the run again) · 更换连接方式 (设置); otherwise 重试 · 更换连接方式. Redesign R4b (P17, F69): 复制诊断信息 is
//   only in 设置 → 关于 → ▾ 高级 now, not on this banner.
// A retry that starts the run, or another connection chosen, takes the banner away (getHome().problem is null again).
// Test hooks: [data-part="problem"][data-code][data-connection-code][data-kind], .today-problem__text, [data-part="problem-fix"],
// [data-action=login|retry|change] (at most three), [data-part="login-failed"].
import { html, useState } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { CONNECTIONS } from '../texts/common.js'
import { TODAY as T } from '../texts/today.js'

const P = T.problem
const LOGIN = ['login-expired', 'not-logged-in']

/** The banner's words: { text, fix, login } — `login` when the fix is a sign-in on a command-line tool. */
export function problemWords(problem) {
  const kind = problem.kind ?? null
  const name = kind && Object.hasOwn(CONNECTIONS.names, kind) ? CONNECTIONS.names[kind] : ''
  const code = problem.connectionCode ?? null
  const n = problem.caughtKept ?? 0
  if (problem.code === 'connection' && !kind) return { text: fmt(P.connection.none, { n }), fix: P.fix.none, login: false }
  if (problem.code === 'connection') {
    const known = code && Object.hasOwn(P.connection, code)
    const text = fmt(known ? P.connection[code] : P.connection.other, { name, n })
    const login = ['claude-code', 'codex'].includes(kind) && LOGIN.includes(code)
    const fix = LOGIN.includes(code) ? P.fix.login : Object.hasOwn(P.fix, code) ? P.fix[code] : P.fix.other
    return { text, fix, login }
  }
  // redesign R5b (O9): a problem the page has no words for is said as a connection problem, never by its code
  const text = Object.hasOwn(P, problem.code) && typeof P[problem.code] === 'string' ? P[problem.code] : fmt(P.connection.other, { name, n })
  return { text, fix: null, login: false }
}

function Btn({ name, primary, quiet, disabled, onClick, children }) {
  return html`<span class="st-act" data-action=${name}><button type="button" class=${`btn${primary ? ' primary' : quiet ? ' quiet' : ''}`} disabled=${disabled} onClick=${onClick}>${children}</button></span>`
}

/**
 * @param {object} p
 * @param {object} p.problem - getHome().problem
 * @param {boolean} p.busy
 * @param {() => void} p.onRetry - the run again (the head's startRound)
 * @param {() => void} p.onChange - to 设置
 * @param {() => Promise<void>} p.onRedetect - detect the connections again (before the retry after a sign-in)
 */
export function ProblemCard({ problem, busy, onRetry, onChange, onRedetect }) {
  const [loginFailed, setLoginFailed] = useState(false)
  if (!problem) return null
  const { text, fix, login } = problemWords(problem)
  const kind = problem.kind ?? null
  const openLogin = async () => {
    setLoginFailed(false)
    try { const r = await call('openLogin', kind); if (!r?.ok) setLoginFailed(true) } catch { setLoginFailed(true) }
  }
  const signedIn = async () => { await onRedetect?.(); onRetry() }
  const buttons = login
    ? [
        html`<${Btn} key="login" name="login" primary disabled=${busy} onClick=${openLogin}>${P.login}<//>`,
        html`<${Btn} key="retry" name="retry" disabled=${busy} onClick=${signedIn}>${P.loginAgain}<//>`,
        html`<${Btn} key="change" name="change" quiet disabled=${busy} onClick=${onChange}>${P.change}<//>`,
      ]
    : [
        html`<${Btn} key="retry" name="retry" primary disabled=${busy} onClick=${onRetry}>${P.retry}<//>`,
        html`<${Btn} key="change" name="change" disabled=${busy} onClick=${onChange}>${P.change}<//>`,
      ]
  return html`<section class="progress-alert today-problem" data-part="problem" data-code=${problem.code} data-connection-code=${problem.connectionCode ?? ''} data-kind=${kind ?? ''} role="alert" aria-label=${text}>
    <div class="today-problem__text">${text}</div>
    ${fix ? html`<div class="today-problem__fix" data-part="problem-fix">${fix}</div>` : null}
    <div class="today-problem__actions">${buttons}
      ${loginFailed ? html`<span class="today-problem__note" data-part="login-failed" role="alert">${P.loginFailed}</span>` : null}
    </div>
  </section>`
}
