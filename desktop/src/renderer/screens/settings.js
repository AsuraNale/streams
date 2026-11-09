// 设置 (mockup S14): four parts — 连接方式 (getConnections and the connection methods), 运行, 库 (the app state's library,
// chooseLibraryFolder / useChosenFolder, openRecentLibrary, rebuildIndex), and the software part
// (the language, the developer switch, the diagnostics, 「关于」 with the update: screens/settings-update.js). Data: the app
// state (useApp) and the bridge (lib/bridge.js); words: texts/settings.js and texts/common.js CONNECTIONS. The pieces of a
// connection row that 首次设置 and the problem card of 今日 draw too are exported from here (detectWords, connectionState,
// needsLogin, probeView, LoginLoop, ProbeLine, ApiKeyDialog).
// Test hooks: [data-part="…"] on each part; [data-connection=<kind>][data-conn-state] rows with input[data-field="active"],
// select[data-field="model"|"verify-model"], [data-action=probe|login|login-again|setup-key]; the key dialog [data-dialog="api-key"]
// with select[data-field="vendor"], input[data-field="base-url"|"key"], [data-action=save-key|remove-key|cancel-key];
// v2 package F (design P9; docs/desktop.md §4.4): the schedule and the cap per round are each library's own now and are changed
// on its 来源与要求 (screens/sources.js); 运行 shows 「定时一览」 — one line per library: its name (a click: that library's
// 来源与要求), on or off, the time, the next run (getLibrarySchedule), read only — and 「全部库本月用量合计」 (getUsageTotal).
// [data-part="schedules"] [data-schedule-row=<id>][data-schedule=on|off|unknown] with [data-action="go-library"],
// [data-part="usage"][data-calls] with [data-usage-library=<id>]; [data-part="library"] [data-library-path],
// [data-action=new-library|open-folder|rebuild], [data-recent=<path>], [data-part="setup"][data-setup="none"|"recorded"] with
// [data-setup-step=<step>][data-by=<by>]; the language radios' ids `settings-language-<setting>`; [data-part="theme"]
// select[data-field="theme"] (setTheme, docs/desktop.md §五「主题」); [data-action="licenses"] → [data-dialog="licenses"] with
// [data-part=license-text|components|notices], [data-component=<name>], [data-action=open-notices|close-licenses].
// v2 package I (contract I2; design P9): five groups, top to bottom, each a [data-group=<id>] with its parts —
//   connection  连接方式 (v1.0's three connections, two model slots each) + 「主 Agent 用这条连接的主模型」 [data-part="agent-uses"]
//   agent       主 Agent [data-part="agent"] (getAgentStatus: the connection [data-agent-connection], whether the session goes on
//               [data-session=live|none|api], how many turns [data-turns], the last summary [data-summary]); 「打开和主 Agent 聊」
//               [data-action="open-chat"]. No 「清空对话」.
//   library     新建库默认放在 [data-part="library-root"][data-root-default=true|false] with [data-root-path],
//               [data-action=change-root|reset-root], [data-root-note=saved|bad|failed] (getLibraryRoot / chooseLibraryRoot /
//               setLibraryRoot); 定时一览 and 全部库本月用量合计 (package F's, as they were)
//   look        主题, 语言 (as they were)
//   software    关于 (the version and the update), 许可证与致谢, 高级 (as they were)
// What only meant something for the current library (its path, the other libraries, 新建库 / 打开已有文件夹, 重建索引, 首次设置's
// record) is gone from here: 来源与要求's 「这个库」 (screens/sources.js; SetupRecord below is drawn there) and 新建库 (screens/
// new-library.js). [data-part="library"] is no longer on this page.
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, nextText, whenText } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { AppFrame, AppSidebar, Button, Dialog, LinkButton, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, NEXT_WHEN, SEP, WHEN } from '../texts/common.js'
import { SETTINGS as T } from '../texts/settings.js'
import { SHELL } from '../texts/shell.js'
import { AboutUpdate } from './settings-update.js'
import { THEME_IDS } from '../../shared/themes.mjs'

const KINDS = ['claude-code', 'codex', 'api']
// 首次设置's six records (core SETUP_STEPS), in the wizard's order
const SETUP_STEPS = ['library', 'connection', 'pack', 'sources', 'trial', 'schedule']

/** One word for a kind's state (getConnections().kinds[kind]): usable · not-logged-in · not-installed · no-key. */
export function connectionState(kind, k) {
  if (!k) return 'not-installed'
  if (kind === 'api') return k.hasKey ? 'usable' : 'no-key'
  if (!k.installed) return 'not-installed'
  return k.loggedIn ? 'usable' : 'not-logged-in'
}

/** Is the login loop (去登录 …) shown for this kind? Only the two command-line tools, installed but not signed in. */
export const needsLogin = (kind, k) => (kind === 'claude-code' || kind === 'codex') && Boolean(k?.installed) && !k?.loggedIn

/** The detection line: 「已找到 · 版本 2.1 · 已登录」, 「没找到」, 「已设置 key（末四位 ab12）」. */
export function detectWords(kind, k) {
  if (kind === 'api') return k?.hasKey ? fmt(CONNECTIONS.keySet, { hint: k.keyHint ?? '' }) : CONNECTIONS.keyNone
  if (!k?.installed) return CONNECTIONS.notFound
  const parts = [CONNECTIONS.found]
  if (k.version) parts.push(fmt(CONNECTIONS.version, { version: k.version }))
  parts.push(k.loggedIn ? CONNECTIONS.loggedIn : CONNECTIONS.notLoggedIn)
  return parts.join(SEP)
}

/** A stored probe (getConnections().probes[kind]) in the shape ProbeLine draws. */
export const probeView = p => (p && typeof p === 'object' ? { status: p.ok ? 'ok' : 'failed', result: p } : null)

const reasonOf = r => (r?.code && Object.hasOwn(CONNECTIONS.codes, r.code) ? CONNECTIONS.codes[r.code] : String(r?.code ?? CONNECTIONS.codes.unknown))

export function ProbeLine({ probe }) {
  if (!probe) return null
  if (probe.status === 'trying') return html`<span class="st-t-small st-t-sub" data-probe="trying" role="status">${CONNECTIONS.probe.trying}</span>`
  if (probe.status === 'ok') return html`<span class="st-t-small st-t-done" data-probe="ok" role="status">${fmt(CONNECTIONS.probe.ok, { seconds: ((probe.result?.latencyMs ?? 0) / 1000).toFixed(1) })}</span>`
  return html`<span class="st-t-small st-t-wait" data-probe="failed" role="status">${fmt(CONNECTIONS.probe.failed, { reason: reasonOf(probe.result) })}</span>`
}

/** 「去登录」 + the line under it + 「我登录好了，再试一次」 (= detectConnections, through onRedetect). */
export function LoginLoop({ kind, busy, onRedetect }) {
  const [failed, setFailed] = useState(false)
  const open = async () => {
    setFailed(false)
    try { const r = await call('openLogin', kind); if (!r?.ok) setFailed(true) } catch { setFailed(true) }
  }
  return html`<div class="st-login" data-part="login" data-kind=${kind}>
    <div class="st-login__row">
      <${Act} name="login" variant="primary" disabled=${busy} onClick=${open}>${CONNECTIONS.login.go}<//>
      <span class="st-t-small st-t-sub">${CONNECTIONS.login.note}</span>
    </div>
    <div class="st-login__row">
      <${Act} name="login-again" disabled=${busy} onClick=${onRedetect}>${CONNECTIONS.login.again}<//>
      ${failed ? html`<span class="st-t-small st-t-wait" role="alert">${CONNECTIONS.login.failed}</span>` : null}
    </div>
  </div>`
}

/** 「输入 API key」: the vendor (from the bridge's table), the address for a custom one, the key (sent once, never shown). */
export function ApiKeyDialog({ api, onClose, onChanged }) {
  const vendors = Array.isArray(api?.vendors) ? api.vendors : []
  const [vendor, setVendor] = useState(api?.vendor ?? vendors[0]?.id ?? 'custom')
  const [baseUrl, setBaseUrl] = useState(api?.baseUrl ?? '')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const custom = vendor === 'custom'
  const save = async () => {
    if (key.trim() === '') return
    setBusy(true)
    setNote(null)
    try {
      await call('setApiVendor', vendor, custom ? baseUrl.trim() : null)
      await call('setApiKey', vendor, key.trim())
      setKey('')
      setNote(T.apiDialog.saved)
      onChanged?.()
      onClose()
    } catch { setNote(T.apiDialog.failed) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    setNote(null)
    try {
      await call('removeApiKey', vendor)
      setNote(T.apiDialog.removed)
      onChanged?.()
      onClose()
    } catch { setNote(T.apiDialog.failed) } finally { setBusy(false) }
  }
  const actions = html`${api?.hasKey ? html`<${Act} name="remove-key" disabled=${busy} onClick=${remove}>${T.apiDialog.remove}<//>` : null}
    <${Act} name="cancel-key" disabled=${busy} onClick=${onClose}>${T.apiDialog.cancel}<//>
    <${Act} name="save-key" variant="primary" disabled=${busy || key.trim() === '' || (custom && baseUrl.trim() === '')} onClick=${save}>${T.apiDialog.save}<//>`
  return html`<${Dialog} name="api-key" title=${T.apiDialog.title} onCancel=${onClose} actions=${actions}>
    ${api?.hasKey ? html`<div class="st-t-small st-t-sub" data-has-key=${api.keyHint ?? ''}>${fmt(T.apiDialog.hasKey, { hint: api.keyHint ?? '' })}</div>` : null}
    <label class="st-dialog__label" for="settings-vendor">${T.apiDialog.vendor}</label>
    <select id="settings-vendor" class="st-dialog__input" data-field="vendor" value=${vendor} onChange=${e => setVendor(e.currentTarget.value)}>
      ${vendors.map(v => html`<option key=${v.id} value=${v.id} selected=${v.id === vendor}>${v.label}</option>`)}
    </select>
    ${custom ? html`<label class="st-dialog__label" for="settings-base-url">${T.apiDialog.baseUrl}</label>
      <input id="settings-base-url" class="st-dialog__input" type="url" data-field="base-url" placeholder=${T.apiDialog.baseUrlPlaceholder} value=${baseUrl} onInput=${e => setBaseUrl(e.currentTarget.value)} />` : null}
    <label class="st-dialog__label" for="settings-key">${T.apiDialog.key}</label>
    <input id="settings-key" class="st-dialog__input" type="password" autocomplete="off" data-field="key" placeholder=${T.apiDialog.keyPlaceholder} value=${key} data-dialog-initial onInput=${e => setKey(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
    ${note ? html`<div class="st-dialog__error" role="alert">${note}</div>` : null}
  <//>`
}

/** One group of the page (v2 package I): its name, then its parts. */
function Group({ id, name, children }) {
  return html`<section class="settings__group" data-group=${id} aria-labelledby=${`settings-group-${id}`}>
    <h2 class="settings__group-name" id=${`settings-group-${id}`}>${name}</h2>
    <div class="settings__group-parts">${children}</div>
  </section>`
}

/** One part of the page: a name on the left, the content on the right. */
function Part({ id, name, hint, children }) {
  return html`<section class="settings__part" data-part=${id} aria-labelledby=${`settings-${id}`}>
    <div>
      <h3 class="settings__name st-t-body" id=${`settings-${id}`}>${name}</h3>
      ${hint ? html`<div class="st-t-small st-t-muted">${hint}</div>` : null}
    </div>
    <div class="settings__content">${children}</div>
  </section>`
}

function ModelSelect({ id, label, hint, value, models, noneLabel, onChange }) {
  return html`<label class="settings__slot" for=${id}>
    <span class="st-t-small st-t-sub">${label}</span>
    <select id=${id} class="settings__select" data-field=${id.endsWith('-verify') ? 'verify-model' : 'model'} value=${value ?? ''} onChange=${e => onChange(e.currentTarget.value === '' ? null : e.currentTarget.value)}>
      <option value="" selected=${!value}>${noneLabel}</option>
      ${(models ?? []).map(m => html`<option key=${m.id} value=${m.id} selected=${m.id === value}>${m.label ?? m.id}</option>`)}
    </select>
    ${hint ? html`<span class="st-t-tiny st-t-muted">${hint}</span>` : null}
  </label>`
}

function ConnectionsPart() {
  const conns = useLoad(() => call('getConnections'), [])
  useEvent('connections-changed', () => conns.reload())
  const [busy, setBusy] = useState(false)
  const [probes, setProbes] = useState({})
  const [keyDialog, setKeyDialog] = useState(false)
  const data = conns.data
  const act = async fn => {
    setBusy(true)
    try { await fn() } catch { /* the rows say what they know */ } finally { setBusy(false); conns.reload() }
  }
  const redetect = () => act(async () => { const d = await call('detectConnections'); conns.mutate(() => d) })
  const probe = async kind => {
    setProbes(p => ({ ...p, [kind]: { status: 'trying' } }))
    try { const r = await call('probeConnection', kind); setProbes(p => ({ ...p, [kind]: { status: r.ok ? 'ok' : 'failed', result: r } })) } catch { setProbes(p => ({ ...p, [kind]: { status: 'failed', result: { code: 'unknown' } } })) }
  }
  const setModels = (kind, k, patch) => act(() => call('setConnectionModels', kind, { model: k.model ?? null, verifyModel: k.verifyModel ?? null, ...patch }))
  return html`<${Part} id="connections" name=${T.connections} hint=${T.connectionsHint}>
    ${!data && conns.status === 'error' ? html`<div class="settings__error">${T.connectionsFailed}</div>` : null}
    ${data ? html`<div class="settings__conns" role="radiogroup" aria-label=${T.conn.use}>
      ${KINDS.map(kind => {
        const k = data.kinds?.[kind] ?? {}
        const state = connectionState(kind, k)
        const active = data.active === kind
        const stateWords = [detectWords(kind, k)]
        if (active) stateWords.push(CONNECTIONS.inUse)
        if (state === 'usable') stateWords.push(CONNECTIONS.usable)
        return html`<div key=${kind} class=${`settings__conn${active ? ' settings__conn--active' : ''}`} data-connection=${kind} data-conn-state=${state} data-active=${String(active)}>
          <div class="settings__conn-head">
            <label class="settings__conn-use" for=${`settings-active-${kind}`}>
              <input type="radio" name="active" id=${`settings-active-${kind}`} data-field="active" value=${kind} checked=${active} disabled=${busy} onChange=${() => act(() => call('setActiveConnection', kind))} />
              <b>${CONNECTIONS.names[kind]}</b>
            </label>
            <span class="st-t-small st-t-sub" data-conn-words>${stateWords.join(SEP)}</span>
          </div>
          ${kind === 'api' ? html`<div class="st-t-small st-t-muted">${T.conn.apiHint}</div>` : null}
          <div class="settings__slots">
            <${ModelSelect} id=${`settings-model-${kind}`} label=${T.conn.model} hint=${T.conn.modelHint} value=${k.model ?? null} models=${k.models} noneLabel=${CONNECTIONS.defaultModel} onChange=${v => setModels(kind, k, { model: v })} />
            <${ModelSelect} id=${`settings-model-${kind}-verify`} label=${T.conn.verify} hint=${T.conn.verifyHint} value=${k.verifyModel ?? null} models=${k.models} noneLabel=${CONNECTIONS.sameAsMain} onChange=${v => setModels(kind, k, { verifyModel: v })} />
          </div>
          ${needsLogin(kind, k) ? html`<${LoginLoop} kind=${kind} busy=${busy} onRedetect=${redetect} />` : null}
          <div class="settings__row">
            ${kind === 'api' ? html`<${Act} name="setup-key" disabled=${busy} onClick=${() => setKeyDialog(true)}>${T.conn.setup}<//>` : null}
            <${Act} name="probe" disabled=${busy || state !== 'usable'} onClick=${() => probe(kind)}>${T.conn.probe}<//>
            <${ProbeLine} probe=${probes[kind] ?? probeView(data.probes?.[kind])} />
          </div>
        </div>`
      })}
    </div>` : null}
    <div class="st-t-small st-t-sub">${T.conn.which}</div>
    <div class="st-t-small st-t-sub" data-part="agent-uses">${T.conn.agentUses}</div>
    ${keyDialog ? html`<${ApiKeyDialog} api=${data?.kinds?.api ?? {}} onClose=${() => setKeyDialog(false)} onChanged=${redetect} />` : null}
  <//>`
}

/** 「定时一览」: every library's schedule, read only; a click on a name: that library's 来源与要求, where it is changed. */
function SchedulesPart() {
  const { libraries, openLibrary, navigate } = useApp()
  const rows = Array.isArray(libraries?.data) ? libraries.data : []
  const ids = rows.map(r => r.id).join(',')
  const scheds = useLoad(() => Promise.all(rows.map(r => call('getLibrarySchedule', r.id).then(s => [r.id, s], () => [r.id, null]))).then(Object.fromEntries), [ids])
  useEvent('settings-changed', () => scheds.reload())
  const go = async id => { if (await openLibrary(id)) navigate('sources', { section: 'run' }) }
  return html`<${Part} id="schedules" name=${SHELL.settings.schedules} hint=${SHELL.settings.schedulesHint}>
    ${rows.length ? html`<table class="settings__schedules">
      <thead><tr><th scope="col">${SHELL.settings.library}</th><th scope="col">${SHELL.settings.on}</th><th scope="col">${SHELL.settings.next}</th></tr></thead>
      <tbody>${rows.map(r => {
        const s = scheds.data?.[r.id] ?? null
        return html`<tr key=${r.id} data-schedule-row=${r.id} data-schedule=${s ? (s.enabled ? 'on' : 'off') : 'unknown'}>
          <td><a href="#" class="settings__link" data-action="go-library" onClick=${e => { e.preventDefault(); go(r.id) }}>${r.name}</a></td>
          <td>${s ? (s.enabled ? s.time : SHELL.settings.off) : scheds.data ? html`<span class="st-t-small st-t-muted">${SHELL.settings.schedulesFailed}</span>` : ''}</td>
          <td class="st-t-small st-t-sub">${s?.nextRunAt ? nextText(s.nextRunAt, NEXT_WHEN) ?? s.nextRunAt : s ? T.scheduleOff : ''}</td>
        </tr>`
      })}</tbody>
    </table>` : html`<span class="st-t-small st-t-muted">${SHELL.settings.schedulesNone}</span>`}
    <div class="st-t-small st-t-sub">${T.scheduleMissed}</div>
    <div class="st-t-small st-t-sub">${T.scheduleClose}</div>
  <//>`
}

/** 「全部库本月用量合计」 (维护者 11-05): getUsageTotal — the calls and the tokens of every library this month, and each one's calls. */
function UsagePart() {
  const usage = useLoad(() => call('getUsageTotal'), [])
  useEvent('inbox-changed', () => usage.reload())
  useEvent('libraries-changed', () => usage.reload())
  const u = usage.data
  return html`<${Part} id="usage" name=${SHELL.settings.usage} hint=${SHELL.settings.usageHint}>
    ${!u && usage.status === 'error' ? html`<div class="settings__error">${SHELL.settings.usageFailed}</div>` : null}
    ${u ? html`<div data-calls=${u.calls} data-month=${u.month}>
      <div class="st-t-strong">${fmt(SHELL.settings.usageLine, { calls: u.calls, input: u.inputTokens, output: u.outputTokens })}</div>
      <ul class="settings__usage">${(u.libraries ?? []).map(l => html`<li key=${l.id} class="st-t-small st-t-sub" data-usage-library=${l.id} data-calls=${l.calls}>${l.missing ? fmt(SHELL.settings.usageMissing, { name: l.name }) : fmt(SHELL.settings.usageLibrary, { name: l.name, calls: l.calls })}</li>`)}</ul>
    </div>` : null}
  <//>`
}

/** 「首次设置」 (plan A1): who decided each of the wizard's six steps, from the current library's streams.json (getSetup). v2
 * package I: drawn in 来源与要求's 「这个库」 (screens/sources.js); the connection's record comes from 首次打开 (settings.json). */
export function SetupRecord({ setup }) {
  if (setup.status === 'error' && !setup.data) return html`<span class="settings__error" data-part="setup" data-setup="error">${T.setupFailed}</span>`
  if (!setup.data) return html`<span data-part="setup" data-setup="loading"></span>`
  const steps = SETUP_STEPS.filter(s => Object.hasOwn(setup.data, s))
  if (!steps.length) return html`<span class="st-t-small st-t-muted" data-part="setup" data-setup="none">${T.setupNone}</span>`
  return html`<ul class="settings__setup" data-part="setup" data-setup="recorded">
    ${SETUP_STEPS.map(step => {
      const by = setup.data[step]?.by ?? null
      const words = by && Object.hasOwn(T.setupBy, by) ? T.setupBy[by] : T.setupNone
      return html`<li key=${step} class="st-t-small" data-setup-step=${step} data-by=${by ?? ''}>${fmt(T.setupLine, { step: T.setupSteps[step], by: words })}</li>`
    })}
  </ul>`
}

/** 主 Agent (v2 package I): getAgentStatus — the connection, the session, the conversation, the last summary. */
function AgentPart() {
  const { navigate } = useApp()
  const st = useLoad(() => call('getAgentStatus'), [])
  useEvent('agent-changed', p => { if (p?.phase === 'done') st.reload() })
  useEvent('connections-changed', () => st.reload())
  const A = T.agent
  const d = st.data
  const session = !d ? null : d.connection === null ? 'none' : d.sessionful === false ? 'api' : d.session?.live ? 'live' : 'none'
  const sessionText = session === 'live' ? fmt(A.sessionLive, { turns: d.session.turns ?? 0 }) : session === 'api' ? A.sessionApi : A.sessionNone
  const conn = d?.connection
  const connText = !conn ? A.connectionNone : Object.hasOwn(CONNECTIONS.names, conn) ? CONNECTIONS.names[conn] : conn
  return html`<${Part} id="agent" name=${A.name} hint=${A.hint}>
    ${!d && st.status === 'error' ? html`<div class="settings__error">${A.failed}</div>` : null}
    ${d ? html`<dl class="settings__kv-list">
      <dt class="st-t-small st-t-sub">${A.connection}</dt>
      <dd class=${conn ? '' : 'st-t-wait'} data-agent-connection=${conn ?? ''}>${connText}</dd>
      <dt class="st-t-small st-t-sub">${A.session}</dt>
      <dd data-session=${session}>${sessionText}</dd>
      <dt class="st-t-small st-t-sub">${A.talk}</dt>
      <dd data-turns=${d.turns ?? 0}>${fmt(A.talkLine, { turns: d.turns ?? 0, entries: d.entries ?? 0 })}</dd>
      <dt class="st-t-small st-t-sub">${A.summary}</dt>
      <dd data-summary=${d.lastSummaryAt ?? ''}>${d.lastSummaryAt ? whenText(d.lastSummaryAt, WHEN) ?? d.lastSummaryAt : A.summaryNone}</dd>
    </dl>` : null}
    <div class="settings__row"><${Act} name="open-chat" icon="chat" onClick=${() => navigate('chat')}>${A.open}<//></div>
  <//>`
}

/** 新建库默认放在 (v2 package I): getLibraryRoot; 「换一个文件夹…」 = chooseLibraryRoot (the system's dialog); 「恢复默认」 = setLibraryRoot(null). */
function LibraryRootPart() {
  const root = useLoad(() => call('getLibraryRoot'), [])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const R = T.root
  const d = root.data
  const act = async fn => {
    setBusy(true)
    setNote(null)
    try {
      const r = await fn()
      if (r) { root.mutate(() => r); setNote('saved') }
    } catch (err) { setNote(err?.code === 'bad_arguments' ? 'bad' : 'failed') } finally { setBusy(false) }
  }
  return html`<${Part} id="library-root" name=${R.label} hint=${R.hint}>
    ${!d && root.status === 'error' ? html`<div class="settings__error">${R.failed}</div>` : null}
    ${d ? html`<div class="settings__root" data-root-default=${String(d.isDefault === true)}>
      <span class="settings__path-text" data-root-path=${d.path ?? ''}>${d.path ?? ''}</span>
      ${d.isDefault ? html`<span class="settings__default">${R.isDefault}</span>` : null}
    </div>` : null}
    <div class="settings__row">
      <${Act} name="change-root" icon="folder" disabled=${busy || !d} onClick=${() => act(() => call('chooseLibraryRoot'))}>${R.change}<//>
      <${Act} name="reset-root" disabled=${busy || !d || d.isDefault} onClick=${() => act(() => call('setLibraryRoot', null))}>${R.reset}<//>
      ${note ? html`<span class=${note === 'saved' ? 'st-t-small st-t-done' : 'settings__error'} role=${note === 'saved' ? 'status' : 'alert'} data-root-note=${note}>${R[note]}</span>` : null}
    </div>
  <//>`
}

function LanguagePart({ language, onChange }) {
  const setting = language?.setting ?? 'auto'
  const resolved = language?.resolved ?? 'zh-CN'
  const choices = ['auto', 'zh-CN', 'en']
  return html`<${Part} id="language" name=${T.language} hint=${T.languageHint}>
    <div class="settings__models settings__models--three" role="radiogroup" aria-label=${T.languageGroup}>
      ${choices.map(v => html`<label key=${v} class="settings__model" for=${`settings-language-${v}`} data-checked=${String(setting === v)}>
        <input type="radio" name="language" id=${`settings-language-${v}`} value=${v} checked=${setting === v} onChange=${() => onChange(v)} />
        <span class="settings__model-text">
          <b>${T.languages[v]}</b>
          ${v === 'auto' ? html`<span class="st-t-small st-t-sub">${fmt(T.languageNow, { name: T.languages[resolved] })}</span>` : null}
        </span>
      </label>`)}
    </div>
    <div class="st-t-small st-t-sub">${T.languageNote}</div>
    <div class="st-t-small st-t-muted">${T.languageReload}</div>
  <//>`
}

/** 「主题」 (docs/desktop.md §五): the three sets; a choice is setTheme at once (the page's <html data-theme> follows). */
function ThemePart({ theme, failed, onChange }) {
  const current = THEME_IDS.includes(theme) ? theme : THEME_IDS[0]
  return html`<${Part} id="theme" name=${T.theme} hint=${T.themeHint}>
    <div class="settings__row">
      <label class="st-t-small st-t-sub" for="settings-theme">${T.themeLabel}</label>
      <select id="settings-theme" class="settings__select settings__select--theme" data-field="theme" value=${current} onChange=${e => onChange(e.currentTarget.value)}>
        ${THEME_IDS.map(id => html`<option key=${id} value=${id} selected=${id === current}>${T.themes[id]}</option>`)}
      </select>
      ${failed ? html`<span class="settings__error" role="alert">${T.themeFailed}</span>` : null}
    </div>
    <div class="st-t-small st-t-sub">${T.themeNote}</div>
  <//>`
}

/** 许可证与致谢 (mockup S14): Streams' MIT license in full and its maker, the parts that ship with it, the full notices. */
function LicensesDialog({ onClose }) {
  const lic = useLoad(() => call('getLicenses'), [])
  const [failed, setFailed] = useState(false)
  const d = lic.data
  const open = async () => {
    setFailed(false)
    try { await call('openNotices') } catch { setFailed(true) }
  }
  const actions = html`<${Act} name="close-licenses" variant="primary" onClick=${onClose}>${T.licenses.close}<//>`
  return html`<${Dialog} name="licenses" title=${T.licenses.title} onCancel=${onClose} actions=${actions}>
    ${!d && lic.status === 'error' ? html`<div class="settings__error" role="alert">${T.licenses.failed}</div>` : null}
    ${d ? html`<section class="settings__licenses-part" data-part="own" data-license=${d.own.license}>
        <h3 class="settings__licenses-title st-t-body">${T.licenses.own}</h3>
        <div class="st-t-small st-t-sub">${fmt(T.licenses.ownLicense, { license: d.own.license })}</div>
        <pre class="settings__license-text" data-part="license-text" tabindex="0">${d.own.text}</pre>
        <div class="st-t-small" data-part="licenses-made-by"><${LinkButton} onClick=${() => call('openMakerPage').catch(() => {})}>${T.madeBy}<//></div>
      </section>
      <section class="settings__licenses-part" aria-labelledby="settings-components">
        <h3 class="settings__licenses-title st-t-body" id="settings-components">${T.licenses.components}</h3>
        <table class="settings__components" data-part="components">
          <thead><tr><th scope="col">${T.licenses.name}</th><th scope="col">${T.licenses.version}</th><th scope="col">${T.licenses.license}</th></tr></thead>
          <tbody>${d.components.map(c => html`<tr key=${c.name} data-component=${c.name} data-version=${c.version} data-license=${c.license}>
            <td>${c.name}</td><td class="st-t-num">${c.version}</td><td>${c.license}</td>
          </tr>`)}</tbody>
        </table>
      </section>
      <div class="settings__row" data-part="notices" data-available=${String(d.notices.available === true)}>
        <${Act} name="open-notices" disabled=${d.notices.available !== true} onClick=${open}>${T.licenses.notices}<//>
        ${d.notices.available !== true ? html`<span class="st-t-small st-t-sub" data-notices-why>${T.licenses.noticesNone}</span>` : null}
        ${failed ? html`<span class="settings__error" role="alert">${T.licenses.noticesFailed}</span>` : null}
      </div>` : null}
  <//>`
}

export function SettingsScreen() {
  const { appState } = useApp()
  const data = appState.data
  const [devInfo, setDevInfo] = useState(data?.showDeveloperInfo ?? false)
  const [copied, setCopied] = useState(false)
  const [themeFailed, setThemeFailed] = useState(false)
  const [licenses, setLicenses] = useState(false)
  useEffect(() => { if (data) setDevInfo(data.showDeveloperInfo) }, [data?.showDeveloperInfo])
  const changeTheme = async id => {
    setThemeFailed(false)
    try {
      const r = await call('setTheme', id)
      // at once, before the app state comes back (app.js keeps it in step from then on)
      document.documentElement.dataset.theme = r.theme
    } catch { setThemeFailed(true) }
    appState.reload()
  }
  const changeLanguage = async v => {
    try {
      const r = await call('setLanguage', v)
      // the page's words are served per request in the language chosen: a change of the resolved language is a reload,
      // which comes back to this screen
      if (r.changed) { location.hash = 'settings'; location.reload() } else appState.reload()
    } catch { appState.reload() }
  }
  const toggleDevInfo = async on => {
    setDevInfo(on)
    try { await call('setShowDeveloperInfo', on) } catch { /* the state says what happened */ }
    appState.reload()
  }
  const copy = async () => {
    try { await call('copyDiagnostics'); setCopied(true) } catch { setCopied(false) }
  }
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="settings" />`}>
    <${Main} screen="settings" state=${data ? 'ready' : appState.status} labelledby="settings-title">
      <${TopBar} title=${T.title} subtitle=${T.subtitle} titleTag="h1" titleId="settings-title" />
      <div class="st-main__body settings__body">
        <div class="settings__list">
          <${Group} id="connection" name=${T.groups.connection}>
            ${data ? html`<${ConnectionsPart} />` : null}
          <//>
          <${Group} id="agent" name=${T.groups.agent}>
            ${data ? html`<${AgentPart} />` : null}
          <//>
          <${Group} id="library" name=${T.groups.library}>
            ${data ? html`<${LibraryRootPart} /><${SchedulesPart} /><${UsagePart} />` : null}
          <//>
          <${Group} id="look" name=${T.groups.look}>
            ${data ? html`<${ThemePart} theme=${data.theme} failed=${themeFailed} onChange=${changeTheme} />` : null}
            <${LanguagePart} language=${data?.language} onChange=${changeLanguage} />
          <//>
          <${Group} id="software" name=${T.groups.software}>
          <${Part} id="about" name=${T.about}>
            ${data ? html`<${AboutUpdate} version=${data.version} devBuild=${data.devBuild} />` : null}
            <div class="st-t-small st-t-muted" data-part="made-by"><${LinkButton} onClick=${() => call('openMakerPage').catch(() => {})}>${T.madeBy}<//></div>
            <div><${Act} name="licenses" onClick=${() => setLicenses(true)}>${T.licensesOpen}<//></div>
          <//>
          <${Part} id="advanced" name=${T.advanced} hint=${T.advancedHint}>
            <div class="settings__advanced">
              <div class="settings__check">
                <input type="checkbox" id="settings-dev-info" checked=${devInfo} onChange=${e => toggleDevInfo(e.currentTarget.checked)} />
                <div>
                  <label class="settings__check-name" for="settings-dev-info">${T.devInfo}</label>
                  <div class="st-t-small st-t-sub">${T.devInfoText}</div>
                </div>
              </div>
              <div class="settings__diag">
                <${Button} icon="copy" onClick=${copy}>${T.copyDiagnostics}<//>
                <span class="st-t-small st-t-sub">${copied ? T.copied : T.diagnosticsText}</span>
              </div>
            </div>
          <//>
          <//>
          ${licenses ? html`<${LicensesDialog} onClose=${() => setLicenses(false)} />` : null}
        </div>
      </div>
    <//>
  <//>`
}
