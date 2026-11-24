// 首次打开 (redesign R4a, contract R4a-1 / R4a-2; design 03-页面稿 P01, P02, 07-模板版 首次打开 · 连接选择; F08, F09; 维护者 11-11 第 4
// 题「并成一屏，流息先选好连接」): what the app opens on while it knows no library at all (app.js: getAppState().libraryCount 0).
// The usual frame — the sidebar, the right panel (its 详情 is 「流息怎样工作」, the template's home-context) — and one screen:
//   P01 (`view` home): the template's work-header (欢迎使用流息 · a line · the current connection's chip); then a new-content form:
//     a file-row 「当前连接：连接你电脑上的 Claude Code」 + 「版本 x · 已登录 · 用量计入你的套餐」 + 已连接 + 「更换连接」 (no
//     connection: 未连接 + 「选择连接」); 「你想追踪什么内容？」 and its line; three examples (file-row: a click only fills the box,
//     nothing is sent); the box (field); the form-footer: 发送 (→ the build conversation, the sentence sent there: route 'build'
//     with params.send — the first real call of the connection is that sentence; there is no separate 试一次), 手动创建 (→ 新建库),
//     暂不创建，先进入应用 (→ 库架).
//   P02 (`view` pick): 连接选择 — shown only when no usable connection was found, the one found is not signed in, or 更换连接
//     was pressed. Three file-rows: each connection's name (推荐 on the one the detection recommends), found or not and its
//     version, signed in or not, whose bill it goes on; 前往登录 (openLogin: a visible terminal where the CLI signs itself in;
//     Streams never handles an account) + 已登录，重新检测 under it (after-card); 使用此连接 on a usable one; 输入 API key opens the
//     key dialog (screens/settings.js ApiKeyDialog; its look is R4b's). The form-footer: 重新检测 · 暂时跳过，稍后在设置中连接.
//     Choosing one (setActiveConnection) goes back to P01 with that one on top.
// How the connection is chosen without asking (F08): the detection (getConnections) first; a connection already set and usable
// is kept; else the first usable one in the order Claude Code · Codex · API key (signed in; the API: a key stored) is set
// (setActiveConnection) and P01 shows; none usable → P02. 推荐 is on that one (none usable: on Claude Code). Who decided it goes into settings.json's
// setupConnection while there is no library (recordSetupStep('connection'): default · chose · skipped); the first library made
// copies it (services/library.mjs). No probe is made here.
// Words: texts/first-run.js FIRST_RUN, HOW_IT_WORKS; the connections' names texts/common.js CONNECTIONS.names (V7).
// Test hooks: main[data-screen="first-run"][data-state], [data-part="first-run"][data-view=loading|home|pick]; [data-part=current-connection][data-kind] ·
// [data-part=no-connection] · [data-part=examples] [data-example=<0..2>] · textarea[data-field=track] · [data-part=connect-cards]
// [data-connection=<kind>][data-conn-state][data-recommended][data-selected]; [data-action=change-connection|pick-connection|
// example|send|manual-new|open-existing (1.1 W13)|skip-create|login|login-again|use|set-key|redetect|skip-connection]; the right panel's
// [data-part=how-it-works].
import { html, useEffect, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, SEP } from '../texts/common.js'
import { FIRST_RUN as T, HOW_IT_WORKS as H } from '../texts/first-run.js'
import { ApiKeyDialog, connectionState, needsLogin } from './settings.js'
import { RightPanel } from './right-panel.js'
import { OpenExistingNote, useOpenExisting } from '../lib/open-existing.js'
import { SHELL } from '../texts/shell.js'

const KINDS = ['claude-code', 'codex', 'api']
const C = T.connect
// 暂时跳过 pressed in this run of the app: coming back to 首次打开 (新建库's 取消) shows the one screen, not the cards again
let skippedThisRun = false

/** The right panel's 详情 beside 首次打开 and 新建库 (the template's home-context). `which` 'first' · 'new'. */
export function HowItWorks({ which = 'first' }) {
  return html`<div class="home-context" data-part="how-it-works">
    <span class="eyebrow">${H.eyebrow}</span>
    <h3>${which === 'new' ? H.titleNew : H.titleFirst}</h3>
    <p>${H.text}</p>
    <div class="section-label">${H.stepsLabel}</div>
    <ol>${H.steps.map((s, i) => html`<li key=${i}>${s}</li>`)}</ol>
    <div class="progress-alert">${H.note}</div>
    <div class="section-label">${H.usageLabel}</div>
    <p>${H.usage}</p>
  </div>`
}

/** 「版本 x · 已登录 · 用量计入你的套餐」 of a usable connection. */
export function connectionLine(kind, k) {
  const parts = []
  if (kind === 'api') parts.push(T.keySet)
  else {
    if (k?.version) parts.push(fmt(T.version, { version: k.version }))
    parts.push(T.loggedIn)
  }
  parts.push(T.billing[kind])
  return parts.join(SEP)
}

/** A card's second line on 连接选择: recommended, found (its version), signed in, whose bill. */
function pickLine(kind, k, recommended) {
  const parts = []
  if (recommended) parts.push(C.recommended)
  if (kind === 'api') {
    parts.push(k?.hasKey ? C.keySet : C.anyVendor)
  } else if (!k?.installed) {
    parts.push(C.notFound)
  } else {
    parts.push(k.version ? fmt(C.foundVersion, { version: k.version }) : C.found)
    parts.push(k.loggedIn ? C.loggedIn : C.notLoggedIn)
  }
  parts.push(T.billing[kind])
  return parts.join(SEP)
}

/** The connection chosen without asking: the first usable one in the order Claude Code · Codex · API key (F08), or null. */
export const firstUsable = d => KINDS.find(kind => connectionState(kind, d?.kinds?.[kind]) === 'usable') ?? null

/** Who decided the connection (settings.json setupConnection while there is no library); a failure is not the page's to show. */
async function record(by, kind) {
  try { await call('recordSetupStep', 'connection', kind ? { by, detail: kind } : { by }) } catch { /* the screen goes on */ }
}

/** P02: the three connections. `onUse(kind)` for 使用此连接; `onSkip()` for 暂时跳过. */
function ConnectPick({ data, busy, onUse, onSkip, onRedetect, onState }) {
  const [keyDialog, setKeyDialog] = useState(false)
  const [loginFailed, setLoginFailed] = useState(null)
  useEffect(() => onState('ready'), [])
  const login = async kind => {
    setLoginFailed(null)
    try { const r = await call('openLogin', kind); if (!r?.ok) setLoginFailed(kind) } catch { setLoginFailed(kind) }
  }
  return html`<div class="thread-scroll st-first-body"><form class="new-content st-first" data-part="connect" onSubmit=${e => e.preventDefault()}>
    <span class="eyebrow">${C.eyebrow}</span>
    <h2>${C.heading}</h2>
    <p>${C.lead}</p>
    <div class="st-first-rows" data-part="connect-cards">
      ${KINDS.map(kind => {
        const k = data.kinds?.[kind] ?? {}
        const state = connectionState(kind, k)
        const usable = state === 'usable'
        const recommended = (firstUsable(data) ?? 'claude-code') === kind
        const selected = data.active === kind && usable
        let tail
        if (needsLogin(kind, k)) tail = html`<span class="st-act" data-action="login"><button type="button" class="btn primary" disabled=${busy} onClick=${() => login(kind)}>${C.login}</button></span>`
        else if (kind === 'api' && !k.hasKey) tail = html`<span class="st-act" data-action="set-key"><button type="button" class="btn" disabled=${busy} onClick=${() => setKeyDialog(true)}>${C.setKey}</button></span>`
        else if (selected) tail = html`<span class="status-chip" data-chosen><span class="dot"></span> ${C.inUse}</span>`
        else if (usable) tail = html`<span class="st-act" data-action="use"><button type="button" class="btn" disabled=${busy} onClick=${() => onUse(kind)}>${C.use}</button></span>`
        else tail = null
        return html`<div key=${kind} class="file-row" data-connection=${kind} data-conn-state=${state} data-recommended=${String(recommended)} data-selected=${String(selected)}>
            <span class="file-icon"><${TIcon} name="spark" /></span>
            <span class="file-text">${CONNECTIONS.names[kind]}<small data-detect>${pickLine(kind, k, recommended)}</small></span>
            ${tail}
          </div>
          ${needsLogin(kind, k) ? html`<div class="after-card" data-login-for=${kind}>
            <span class="st-act" data-action="login-again"><button type="button" disabled=${busy} onClick=${onRedetect}>${C.loginAgain}</button></span>
            ${loginFailed === kind ? html`<span class="limit-note" role="alert">${C.loginFailed}</span>` : null}
          </div>` : null}`
      })}
    </div>
    <div class="form-footer">
      <span class="st-act" data-action="redetect"><button type="button" class="btn" disabled=${busy} onClick=${onRedetect}>${C.redetect}</button></span>
      <span class="st-act" data-action="skip-connection"><button type="button" class="btn quiet" disabled=${busy} onClick=${onSkip}>${C.skip}</button></span>
    </div>
    ${keyDialog ? html`<${ApiKeyDialog} api=${data.kinds?.api ?? {}} onClose=${() => setKeyDialog(false)} onChanged=${onRedetect} />` : null}
  </form></div>`
}

/** P01: the current connection, what to track, the three ways out. */
function TrackHome({ data, onChange }) {
  const { navigate, newLibrary } = useApp()
  // 1.1 W13: 「打开已有的库」 — a library made before (another computer, the app's data gone) comes back from here
  const existing = useOpenExisting()
  const [text, setText] = useState('')
  const box = useRef(null)
  const kind = data?.active ?? null
  const k = kind ? data.kinds?.[kind] : null
  const usable = Boolean(kind && connectionState(kind, k) === 'usable')
  const fill = t => {
    setText(t)
    setTimeout(() => box.current?.focus(), 0)
  }
  const send = () => {
    const t = text.trim()
    if (!t || !usable) return
    // 1.1 W6b: the sentence starts the build conversation (screens/build.js), no longer v1.0's main agent page
    navigate('build', { send: t })
  }
  return html`<div class="thread-scroll st-first-body"><form class="new-content st-first" data-part="track" onSubmit=${e => { e.preventDefault(); send() }}>
    <span class="eyebrow">${T.eyebrow}</span>
    <h2>${T.heading}</h2>
    <p>${T.lead}</p>
    ${usable
      ? html`<div class="file-row st-first-current" data-part="current-connection" data-kind=${kind}>
          <span class="file-icon"><${TIcon} name="spark" /></span>
          <span class="file-text">${fmt(T.current, { name: CONNECTIONS.names[kind] })}<small>${connectionLine(kind, k)}</small></span>
          <span class="status-chip" data-part="connected"><span class="dot"></span> ${T.connected}</span>
          <span class="st-act" data-action="change-connection"><button type="button" class="btn" onClick=${onChange}>${T.change}</button></span>
        </div>`
      : html`<div class="file-row st-first-current" data-part="no-connection">
          <span class="file-icon"><${TIcon} name="spark" /></span>
          <span class="file-text">${T.none}<small>${T.noneLine}</small></span>
          <span class="st-act" data-action="pick-connection"><button type="button" class="btn" onClick=${onChange}>${T.pick}</button></span>
        </div>`}
    <div class="section-label"><span>${T.examplesLabel}</span></div>
    <div class="st-first-rows" data-part="examples">
      ${T.examples.map((t, i) => html`<button type="button" key=${i} class="file-row" data-action="example" data-example=${i} onClick=${() => fill(t)}>
        <span class="file-icon"><${TIcon} name="note" /></span><span class="file-text">${t}<small>${T.exampleHint}</small></span><${TIcon} name="arrow" />
      </button>`)}
    </div>
    <label class="field"><span>${T.inputLabel}</span>
      <textarea data-field="track" ref=${box} placeholder=${T.placeholder} value=${text} maxlength="4000" onInput=${e => setText(e.currentTarget.value)}></textarea>
    </label>
    <div class="form-footer">
      <span class="st-act" data-action="send"><button type="submit" class="btn primary" disabled=${!text.trim() || !usable}>${T.send} <${TIcon} name="arrow" /></button></span>
      <span class="st-act" data-action="manual-new"><button type="button" class="btn quiet" onClick=${() => newLibrary?.()}>${T.manual}</button></span>
      <span class="st-act" data-action="open-existing"><button type="button" class="btn quiet" disabled=${existing.busy} onClick=${existing.open}>${SHELL.openExisting.button}</button></span>
      <span class="st-act" data-action="skip-create"><button type="button" class="btn quiet" onClick=${() => navigate('shelf')}>${T.skip}</button></span>
    </div>
    <${OpenExistingNote} note=${existing.note} />
  </form></div>`
}

/** 首次打开: P01, or P02 when the connection needs a look. */
export function FirstRunScreen() {
  const { appState } = useApp()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState('loading')
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const decided = useRef(false)

  /** The detection, then (the first time only) the choice without asking: kept · recommended · none → P02. */
  const load = async (fresh = false) => {
    setFailed(false)
    let d
    try { d = await call(fresh ? 'detectConnections' : 'getConnections') } catch { setFailed(true); setState('error'); return null }
    if (!decided.current) {
      decided.current = true
      const current = d.active && connectionState(d.active, d.kinds?.[d.active]) === 'usable' ? d.active : null
      const first = firstUsable(d)
      if (current || (!first && skippedThisRun)) setView('home')
      else if (first) {
        try {
          await call('setActiveConnection', first)
          d = { ...d, active: first }
          await record('default', first)
          setView('home')
        } catch { setView('pick') }
      } else setView('pick')
    }
    setData(d)
    setState('ready')
    return d
  }
  useEffect(() => { void load() }, [])
  useEvent('connections-changed', () => { if (decided.current) void load() })

  const redetect = async () => { setBusy(true); try { await load(true) } finally { setBusy(false) } }
  const use = async kind => {
    setBusy(true)
    try {
      await call('setActiveConnection', kind)
      await record('chose', kind)
      setData(d => ({ ...d, active: kind }))
      appState?.reload?.()
      setView('home')
    } catch { /* the cards stay; 重新检测 is there */ } finally { setBusy(false) }
  }
  const skip = async () => {
    // from 更换连接 with a usable one in force: back, nothing changed; else nothing is chosen and that is recorded
    const current = data?.active && connectionState(data.active, data.kinds?.[data.active]) === 'usable'
    skippedThisRun = true
    if (!current) {
      setBusy(true)
      try { await call('setActiveConnection', null); setData(d => ({ ...d, active: null })) } catch { /* as it was */ }
      await record('skipped')
      appState?.reload?.()
      setBusy(false)
    }
    setView('home')
  }

  const pick = view === 'pick'
  const kind = data?.active && connectionState(data.active, data.kinds?.[data.active]) === 'usable' ? data.active : null
  const chip = pick ? null : html`<span class="status-chip" data-part="head-connection">${kind ? fmt(T.headChip, { name: CONNECTIONS.names[kind] }) : T.headChipNone}</span>`
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="first-run" />`} panel=${html`<${RightPanel} detail=${html`<${HowItWorks} which="first" />`} />`}>
    <${Main} screen="first-run" state=${state} labelledby="fr-title">
      <${TopBar} title=${pick ? C.title : T.title} subtitle=${pick ? C.subtitle : T.subtitle} titleTag="h1" titleId="fr-title" actions=${chip} />
      <div class="center st-first-center" data-part="first-run" data-view=${view}>
        ${failed ? html`<div class="thread-scroll st-first-body"><div class="new-content st-first"><div class="progress-alert" role="alert">${T.detectFailed} <button type="button" class="btn quiet" onClick=${() => load()}>${T.retry}</button></div></div></div>`
          : view === 'loading' ? html`<div class="thread-scroll st-first-body"><div class="new-content st-first"><p class="limit-note" role="status">${T.detecting}</p></div></div>`
          : pick ? html`<${ConnectPick} data=${data} busy=${busy} onUse=${use} onSkip=${skip} onRedetect=${redetect} onState=${setState} />`
          : html`<${TrackHome} data=${data} onChange=${() => setView('pick')} />`}
      </div>
    <//>
  <//>`
}
