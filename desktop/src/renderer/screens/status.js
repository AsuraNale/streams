// 运行状态 (mockup S11; docs/desktop.md §4.2). Four numbers (上次运行 · 上次你拍板 · 本月调用次数 · 下次运行), straight from
// getStatus (the core's statusView: lastRound, lastRoundItems, lastDecisionAt, monthUsage; 下次运行 waits for the tray and
// its timer, plan 11-06). The three connections, drawn with the pieces 设置 exports (screens/settings.js: the detection
// words, the state, the login loop, the probe line): the state, 「现在试一次」 (probeConnection), and for a tool that is not
// signed in 「去登录」 + the line under it + 「我登录好了，再试一次」 — the fourth place it appears. The sources of the last
// round: the five words and the rounds in a row, and what the software already did / what you need to do. The top bar:
// 「复制诊断信息」 and 「打开运行记录文件夹」. Read again on `connections-changed` and `library-changed`.
// Test hooks: main[data-screen="status"][data-state], [data-num=last-run|last-decision|month-calls|next-run][data-value],
// [data-part=numbers|connections|sources], [data-connection=<kind>][data-conn-state][data-active], [data-part="login"],
// [data-row=<source>][data-state][data-consecutive], [data-action=copy|logs|probe|login|login-again|redetect|go-settings|fix].
import { html, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { AppFrame, AppSidebar, LinkButton, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, DAY, ERRORS, FETCH_STATES, SEP, SOURCE_STATES, WHEN } from '../texts/common.js'
import { STATUS as T } from '../texts/status.js'
import { LoginLoop, ProbeLine, connectionState, detectWords, needsLogin, probeView } from './settings.js'

const KINDS = ['claude-code', 'codex', 'api']
const FIVE = ['ok', 'empty', 'gap', 'failed', 'blocked']
const stateWord = s => (Object.hasOwn(FETCH_STATES, s) ? FETCH_STATES[s] : Object.hasOwn(SOURCE_STATES, s) ? SOURCE_STATES[s] : String(s ?? ''))
const modelLabel = (k, id, none) => (id ? (k?.models ?? []).find(m => m.id === id)?.label ?? id : none)

function Numbers({ d }) {
  const round = d.lastRound ?? null
  const usage = d.monthUsage ?? {}
  const tiles = [
    ['last-run', round?.startedAt ?? '', round ? whenText(round.startedAt, WHEN) ?? round.startedAt : T.numbers.lastRunNone, round ? fmt(T.numbers.lastRun, { n: d.lastRoundItems ?? 0 }) : T.numbers.lastRunLabel],
    ['last-decision', d.lastDecisionAt ?? '', d.lastDecisionAt ? dayText(d.lastDecisionAt, DAY) ?? d.lastDecisionAt : T.numbers.lastDecisionNone, T.numbers.lastDecision],
    ['month-calls', usage.calls ?? 0, String(usage.calls ?? 0), T.numbers.monthCalls],
    ['next-run', d.nextRun ?? 'none', d.nextRun ? whenText(d.nextRun, WHEN) ?? d.nextRun : T.numbers.nextRunNone, T.numbers.nextRun],
  ]
  return html`<div class="stat-numbers" data-part="numbers">
    ${tiles.map(([id, value, big, label]) => html`<div key=${id} class="stat-num" data-num=${id} data-value=${value}>
      <div class="stat-num__value st-t-num">${big}</div>
      <div class="stat-num__label st-t-small st-t-sub">${label}</div>
    </div>`)}
  </div>`
}

function ConnectionRow({ kind, k, active, probe, busy, onProbe, onRedetect, onSettings }) {
  const state = connectionState(kind, k)
  const words = [detectWords(kind, k)]
  if (state === 'usable') words.push(fmt(T.connections.models, { model: modelLabel(k, k.model, CONNECTIONS.defaultModel), verify: modelLabel(k, k.verifyModel, CONNECTIONS.sameAsMain) }))
  const stored = probeView(probe)
  return html`<div class=${`stat-conn${active ? ' stat-conn--active' : ''}`} data-connection=${kind} data-conn-state=${state} data-active=${String(active)}>
    <div class="stat-conn__head">
      <b>${CONNECTIONS.names[kind]}</b>
      <span class=${`stat-conn__role st-t-tiny${active ? ' stat-conn__role--active' : ''}`}>${active ? T.connections.active : T.connections.spare}</span>
    </div>
    <div class="st-t-small st-t-sub" data-conn-words>${words.join(SEP)}</div>
    ${needsLogin(kind, k) ? html`<${LoginLoop} kind=${kind} busy=${busy} onRedetect=${onRedetect} />` : null}
    ${state === 'not-installed' ? html`<div class="stat-conn__row"><span class="st-t-small st-t-sub">${T.connections.notInstalled}</span><${Act} name="redetect" disabled=${busy} onClick=${onRedetect}>${T.connections.redetect}<//></div>` : null}
    ${state === 'no-key' ? html`<div class="stat-conn__row"><span class="st-t-small st-t-sub">${T.connections.apiNone}</span><${Act} name="go-settings" onClick=${onSettings}>${T.connections.goSettings}<//></div>` : null}
    ${state === 'usable' ? html`<div class="stat-conn__row">
      <${Act} name="probe" disabled=${busy || probe?.status === 'trying'} onClick=${onProbe}>${T.connections.probe}<//>
      <${ProbeLine} probe=${probe?.status ? probe : stored} />
      ${!probe?.status && probe?.at ? html`<span class="st-t-tiny st-t-muted">${fmt(T.connections.probedAt, { when: whenText(probe.at, WHEN) ?? '' })}</span>` : null}
    </div>` : null}
  </div>`
}

function Connections({ onSettings }) {
  const conns = useLoad(() => call('getConnections'), [])
  useEvent('connections-changed', () => conns.reload())
  const [busy, setBusy] = useState(false)
  const [probes, setProbes] = useState({})
  const d = conns.data
  const redetect = async () => {
    setBusy(true)
    try { const r = await call('detectConnections'); conns.mutate(() => r) } catch { /* the rows say what they know */ } finally { setBusy(false); conns.reload() }
  }
  const probe = async kind => {
    setProbes(p => ({ ...p, [kind]: { status: 'trying' } }))
    try { const r = await call('probeConnection', kind); setProbes(p => ({ ...p, [kind]: { status: r.ok ? 'ok' : 'failed', result: r } })) } catch { setProbes(p => ({ ...p, [kind]: { status: 'failed', result: { code: 'unknown' } } })) }
  }
  return html`<section class="stat-part" data-part="connections" aria-labelledby="stat-conns">
    <h2 class="st-t-small st-t-sub st-t-strong" id="stat-conns">${T.connections.heading}</h2>
    ${!d && conns.status === 'error' ? html`<p class="stat-error" role="alert">${T.connections.loadFailed}</p>` : null}
    ${d ? html`<div class="stat-conns">${KINDS.map(kind => html`<${ConnectionRow} key=${kind} kind=${kind} k=${d.kinds?.[kind] ?? {}} active=${d.active === kind}
      probe=${probes[kind] ?? d.probes?.[kind] ?? null} busy=${busy} onProbe=${() => probe(kind)} onRedetect=${redetect} onSettings=${onSettings} />`)}</div>` : null}
  </section>`
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

export function StatusScreen() {
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
  const actions = html`<div class="stat-actions">
    ${copied ? html`<span class="st-t-small st-t-done" role="status">${T.copied}</span>` : null}
    <${Act} name="copy" icon="copy" onClick=${copy}>${T.copy}<//>
    <${Act} name="logs" icon="folder" disabled=${!d} onClick=${logs}>${T.logs}<//>
  </div>`
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="status" />`}>
    <${Main} screen="status" state=${d ? 'ready' : status.status} labelledby="status-title">
      <${TopBar} title=${T.title} titleTag="h1" titleId="status-title" actions=${actions} />
      <div class="st-main__body stat-body">
        ${status.status === 'error' && !d ? html`<div class="stat-error" role="alert">${status.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => status.reload()}>${ERRORS.retry}<//></div>` : null}
        ${error ? html`<div class="stat-error" role="alert">${error}</div>` : null}
        ${d ? html`
          <${Numbers} d=${d} />
          <${Connections} onSettings=${() => navigate('settings')} />
          <section class="stat-part" data-part="sources" aria-labelledby="stat-sources">
            <h2 class="st-t-small st-t-sub st-t-strong" id="stat-sources">${T.sources.heading}</h2>
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
          </section>
        ` : null}
      </div>
    <//>
  <//>`
}
