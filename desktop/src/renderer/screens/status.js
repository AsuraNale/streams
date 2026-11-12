// 运行状态 (mockup S11; docs/desktop.md §4.2) — v2 package F: no screen of its own any more, the 「运行状态」 part of a library's
// 概览 (screens/overview.js; redesign R1: the right panel's 进度, screens/last-run.js). Straight from getStatus (the core's statusView: lastRound, lastRoundItems, lastDecisionAt,
// monthUsage, sources): three numbers (上次运行 · 上次你拍板 · 本月调用次数; 下次运行 is in the library's head now), the sources
// of the last round — the five words and the rounds in a row, what the software already did / what you need to do, 「去处理」
// to 来源与要求 for an address or a refusal — and 「复制诊断信息」, 「打开运行记录文件夹」. Read again on `library-changed` and
// `inbox-changed`. The three connections it also showed in v1.0 are on 设置 only now (they are not a library's).
// Test hooks: [data-part="run"], [data-stat=last-run|last-decision|month-calls][data-value], [data-part="source-status"] with
// [data-row=<source>][data-state][data-consecutive] and [data-what], [data-action=copy-diagnostics|logs|fix].
import { html, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { LinkButton } from '../kit/index.js'
import { DAY, ERRORS, FETCH_STATES, SOURCE_STATES, WHEN } from '../texts/common.js'
import { STATUS as T } from '../texts/status.js'
import { SHELL } from '../texts/shell.js'

const FIVE = ['ok', 'empty', 'gap', 'failed', 'blocked']
const stateWord = s => (Object.hasOwn(FETCH_STATES, s) ? FETCH_STATES[s] : Object.hasOwn(SOURCE_STATES, s) ? SOURCE_STATES[s] : String(s ?? ''))

function Numbers({ d }) {
  const round = d.lastRound ?? null
  const usage = d.monthUsage ?? {}
  const tiles = [
    ['last-run', round?.startedAt ?? '', round ? whenText(round.startedAt, WHEN) ?? round.startedAt : T.numbers.lastRunNone, round ? fmt(T.numbers.lastRun, { n: d.lastRoundItems ?? 0 }) : T.numbers.lastRunLabel],
    ['last-decision', d.lastDecisionAt ?? '', d.lastDecisionAt ? dayText(d.lastDecisionAt, DAY) ?? d.lastDecisionAt : T.numbers.lastDecisionNone, T.numbers.lastDecision],
    ['month-calls', usage.calls ?? 0, String(usage.calls ?? 0), T.numbers.monthCalls],
  ]
  return html`<dl class="stat-kv" data-part="run-numbers">
    ${tiles.map(([id, value, big, label]) => html`<div key=${id} class="stat-kv__row" data-stat=${id} data-value=${value}>
      <dt class="stat-kv__label st-t-small st-t-sub">${label}</dt>
      <dd class="stat-kv__value st-t-strong">${big}</dd>
    </div>`)}
  </dl>`
}

function sourceLines(s) {
  const state = s.paused ? 'paused' : typeof s.status === 'string' && s.status !== '' ? s.status : 'never'
  const word = stateWord(state)
  let head = word
  // (statusView's rows carry no item count; sourcesView's do)
  if (state === 'ok' && typeof s.count === 'number') head = fmt(T.sources.state, { state: word, n: s.count })
  else if (['failed', 'gap', 'blocked'].includes(state)) head = s.http ? fmt(T.sources.streak, { state: word, http: s.http, n: s.consecutive ?? 1 }) : fmt(T.sources.streakNoHttp, { state: word, n: s.consecutive ?? 1 })
  let what
  if (state === 'ok') what = fmt(T.sources.ok, { n: s.consecutive ?? 1 })
  else if (state === 'empty') what = s.lastOkAt ? fmt(T.sources.empty, { date: String(s.lastOkAt).slice(0, 10) }) : T.sources.emptyNoDate
  else what = T.sources[state] ?? ''
  return { state, head, what }
}

/** The 「运行状态」 part of 概览. */
export function RunStatus() {
  const { navigate } = useApp()
  const status = useLoad(() => call('getStatus'), [])
  useEvent('library-changed', () => status.reload())
  useEvent('inbox-changed', () => status.reload())
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const d = status.data
  const copy = async () => {
    setError(null)
    try { await call('copyDiagnostics'); setCopied(true) } catch { setCopied(false); setError(T.failed) }
  }
  const logs = async () => {
    setError(null)
    try { await call('openLogsFolder') } catch { setError(T.failed) }
  }
  const sources = Array.isArray(d?.sources) ? d.sources : []
  return html`<section class="stat-part" data-part="run" aria-labelledby="stat-run">
    <div class="stat-part__head">
      <h2 class="st-t-small st-t-sub st-t-strong" id="stat-run">${SHELL.lastRun.run}</h2>
      <div class="stat-actions">
        ${copied ? html`<span class="st-t-small st-t-done" role="status">${T.copied}</span>` : null}
        <${Act} name="copy-diagnostics" icon="copy" onClick=${copy}>${T.copy}<//>
        <${Act} name="logs" icon="folder" disabled=${!d} onClick=${logs}>${T.logs}<//>
      </div>
    </div>
    ${status.status === 'error' && !d ? html`<div class="stat-error" role="alert">${status.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => status.reload()}>${ERRORS.retry}<//></div>` : null}
    ${error ? html`<div class="stat-error" role="alert">${error}</div>` : null}
    ${d ? html`
      <${Numbers} d=${d} />
      <div class="stat-part" data-part="source-status" aria-labelledby="stat-sources">
        <h3 class="st-t-small st-t-sub st-t-strong" id="stat-sources">${T.sources.heading}</h3>
        ${sources.length ? html`<ul class="stat-sources">${sources.map(s => {
          const l = sourceLines(s)
          return html`<li key=${s.name} class="stat-source" data-row=${s.name} data-state=${l.state} data-consecutive=${s.consecutive ?? ''}>
            <span class="stat-source__name st-t-strong">${s.name}</span>
            <span class="stat-source__state">
              <span class=${FIVE.includes(l.state) ? `st-fetch st-fetch--${l.state}` : 'st-t-small st-t-sub st-t-strong'}>${l.head}</span>
              <span class="st-t-small st-t-sub" data-what>${l.what}</span>
            </span>
            ${['gap', 'blocked'].includes(l.state) ? html`<${Act} name="fix" onClick=${() => navigate('sources')}>${T.sources.fix}<//>` : html`<span></span>`}
          </li>`
        })}</ul>` : html`<p class="st-t-small st-t-muted">${T.sources.none}</p>`}
      </div>
    ` : null}
  </section>`
}
