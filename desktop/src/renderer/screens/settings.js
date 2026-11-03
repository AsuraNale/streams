// 设置 (mockup S14): four parts — 连接方式 (getConnections and the connection methods), 运行 (getPipelineSettings, setRoundCap),
// 库 (the app state's library, chooseLibraryFolder / useChosenFolder, openRecentLibrary, rebuildIndex), and the software part
// (the language, the developer switch, the diagnostics, 「关于」 with the update: screens/settings-update.js). Data: the app
// state (useApp) and the bridge (lib/bridge.js); words: texts/settings.js and texts/common.js CONNECTIONS. The pieces of a
// connection row that 首次设置 and the problem card of 今日 draw too are exported from here (detectWords, connectionState,
// needsLogin, probeView, LoginLoop, ProbeLine, ApiKeyDialog).
// Test hooks: [data-part="…"] on each part; [data-connection=<kind>][data-conn-state] rows with input[data-field="active"],
// select[data-field="model"|"verify-model"], [data-action=probe|login|login-again|setup-key]; the key dialog [data-dialog="api-key"]
// with select[data-field="vendor"], input[data-field="base-url"|"key"], [data-action=save-key|remove-key|cancel-key];
// [data-part="run"] input[data-field="cap"] + [data-action="save-cap"]; [data-part="library"] [data-library-path],
// [data-action=new-library|open-folder|rebuild], [data-recent=<path>]; the language radios' ids `settings-language-<setting>`.
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { AppFrame, AppSidebar, Button, Dialog, Main, TopBar } from '../kit/index.js'
import { CONNECTIONS, SEP } from '../texts/common.js'
import { SETTINGS as T } from '../texts/settings.js'
import { AboutUpdate } from './settings-update.js'

const KINDS = ['claude-code', 'codex', 'api']

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

/** One part of the page: a name on the left, the content on the right. */
function Part({ id, name, hint, children }) {
  return html`<section class="settings__part" data-part=${id} aria-labelledby=${`settings-${id}`}>
    <div>
      <h2 class="settings__name st-t-body" id=${`settings-${id}`}>${name}</h2>
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
    ${keyDialog ? html`<${ApiKeyDialog} api=${data?.kinds?.api ?? {}} onClose=${() => setKeyDialog(false)} onChanged=${redetect} />` : null}
  <//>`
}

function RunPart() {
  const run = useLoad(() => call('getPipelineSettings'), [])
  const [cap, setCap] = useState('')
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (run.data) setCap(String(run.data.cap ?? '')) }, [run.data?.cap])
  const save = async () => {
    const n = Number(cap)
    if (!/^\d+$/.test(cap.trim()) || !Number.isInteger(n) || n <= 0) { setNote(T.capBad); return }
    setBusy(true)
    setNote(null)
    try { await call('setRoundCap', n); setNote(T.capSaved); run.reload() } catch { setNote(T.capBad) } finally { setBusy(false) }
  }
  const d = run.data
  return html`<${Part} id="run" name=${T.run} hint=${T.runHint}>
    ${!d && run.status === 'error' ? html`<div class="settings__error">${T.runFailed}</div>` : null}
    <div class="settings__kv">
      <span class="st-t-small st-t-sub">${T.schedule}</span>
      <span data-schedule=${d?.schedule ? 'set' : 'none'}>${T.scheduleNone}</span>
      <label class="st-t-small st-t-sub" for="settings-cap">${T.cap}</label>
      <span class="settings__row">
        <input id="settings-cap" class="settings__field settings__field--edit settings__field--short" type="number" min="1" step="1" data-field="cap" value=${cap} disabled=${!d || busy} onInput=${e => setCap(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
        <span class="st-t-small st-t-sub">${T.capUnit}</span>
        <${Act} name="save-cap" disabled=${!d || busy} onClick=${save}>${T.capSave}<//>
        ${note ? html`<span class=${note === T.capSaved ? 'st-t-small st-t-done' : 'settings__error'} role="status">${note}</span>` : null}
      </span>
      <span class="st-t-small st-t-sub">${T.thresholds}</span>
      <span>
        <span data-thresholds>${d ? fmt(T.thresholdsValue, { relevance: d.thresholds?.relevance ?? '', substance: d.thresholds?.substance ?? '' }) : ''}</span>
        <span class="st-t-small st-t-muted settings__help">${T.thresholdsHint}</span>
      </span>
    </div>
  <//>`
}

function LibraryPart({ appState }) {
  const library = appState.data?.library ?? null
  const recent = (appState.data?.recentLibraries ?? []).filter(r => (typeof r === 'string' ? r : r?.path) !== library?.path)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rebuilt, setRebuilt] = useState(null)
  const choose = async mode => {
    setBusy(true)
    setNote(null)
    try {
      const r = await call('chooseLibraryFolder')
      if (!r) return
      if (r.state === 'other') { setNote(T.folderOther); return }
      if (mode === 'new' && r.state !== 'empty') { setNote(T.folderNotEmptyForNew); return }
      await call('useChosenFolder', '')
      appState.reload()
    } catch { setNote(T.openFailed) } finally { setBusy(false) }
  }
  const openRecent = async path => {
    setBusy(true)
    setNote(null)
    try { await call('openRecentLibrary', path); appState.reload() } catch { setNote(T.openFailed) } finally { setBusy(false) }
  }
  const rebuild = async () => {
    setBusy(true)
    setNote(null)
    setRebuilt(null)
    try { setRebuilt(await call('rebuildIndex')) } catch { setNote(T.rebuildFailed) } finally { setBusy(false) }
  }
  return html`<${Part} id="library" name=${T.library} hint=${T.libraryHint}>
    <div class="settings__kv">
      <span class="st-t-small st-t-sub">${T.current}</span>
      ${library ? html`<span class="settings__path" data-library-path=${library.path}><b>${library.name}</b><span class="st-t-small st-t-muted settings__help">${library.path}</span></span>` : html`<span class="st-t-sub" data-library-path="">${T.noLibrary}</span>`}
      <span class="st-t-small st-t-sub">${T.others}</span>
      ${recent.length ? html`<ul class="settings__recent">
        ${recent.map(r => { const path = typeof r === 'string' ? r : r.path; const name = typeof r === 'string' ? path.split(/[\\/]/).filter(Boolean).pop() : r.name; return html`<li key=${path}><a href="#" class="settings__link" data-recent=${path} onClick=${e => { e.preventDefault(); openRecent(path) }}>${fmt(T.otherLine, { name, path })}</a></li>` })}
      </ul>` : html`<span class="st-t-small st-t-muted">${T.othersNone}</span>`}
    </div>
    <div class="settings__row">
      <${Act} name="new-library" icon="plus" disabled=${busy} onClick=${() => choose('new')}>${T.newLibrary}<//>
      <${Act} name="open-folder" icon="folder" disabled=${busy} onClick=${() => choose('open')}>${T.openFolder}<//>
      <${Act} name="rebuild" disabled=${busy || !library} onClick=${rebuild}>${busy && rebuilt === null && note === null ? T.rebuilding : T.rebuild}<//>
      ${rebuilt ? html`<span class="st-t-small st-t-done" data-rebuilt=${rebuilt.count}>${fmt(T.rebuilt, { count: rebuilt.count, tidy: rebuilt.pending?.length ?? 0 })}</span>` : null}
      ${note ? html`<span class="settings__error" role="alert">${note}</span>` : null}
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

export function SettingsScreen() {
  const { appState } = useApp()
  const data = appState.data
  const [devInfo, setDevInfo] = useState(data?.showDeveloperInfo ?? false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (data) setDevInfo(data.showDeveloperInfo) }, [data?.showDeveloperInfo])
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
          ${data ? html`<${ConnectionsPart} />` : null}
          ${data?.library ? html`<${RunPart} />` : null}
          <${LibraryPart} appState=${appState} />
          <${LanguagePart} language=${data?.language} onChange=${changeLanguage} />
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
          <${Part} id="about" name=${T.about}>
            ${data ? html`<${AboutUpdate} version=${data.version} devBuild=${data.devBuild} />` : null}
            <div class="st-t-small st-t-muted">${T.madeBy}</div>
          <//>
        </div>
      </div>
    <//>
  <//>`
}
