// 设置 — redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-4; design 03-页面稿 P17, P18, P19 and 07-模板版 「设置」「输入 API
// key」「许可证与致谢」; F63–F69; 维护者 11-11 第 10、15 题). The template's parts (work-header, new-content, filters / filter, section-label,
// file-row, status-chip, field / form-row, mini-chart-free text lines, details, the dialog); the app's layer (template-app.css part 9)
// only sizes and places them. A line on top, four jumps (filters: [data-jump=…] scroll to the part), then four parts:
//   connection  连接: the three connections (v1.0's fixed names, V7), each a row — the name, what the detection found (版本 · 已登录 …),
//               「当前使用」 on the current one, two model slots 主模型 / 核验模型 (setConnectionModels; 核验 defaults to 同主模型),
//               测试连接 (probeConnection; v1.0's 「现在试一次」), 设为当前连接 (setActiveConnection), 配置 on the API row (the key dialog);
//               the sign-in loop on a tool that is not signed in (LoginLoop); under the rows one sentence 「评分、摘要、问库与主 Agent 均使用
//               当前连接的主模型；核验使用核验模型。」. v2 package I's 主 Agent part (turns, shortenings) is gone (维护者 第 10 题).
//   look        外观与语言: R1's four themes (filters with a radio each), 外观 (a field's select), 语言 (filters with a radio each).
//   library     库与用量: 新建库默认存储位置 (getLibraryRoot; 更改… = chooseLibraryRoot, 恢复默认 = setLibraryRoot(null)); 本月用量合计
//               (getUsageTotal): 「n 次模型调用 输入 · 输出」 and the sum written out 「= 各库 n（含运行前自检 n）+ … + 主 Agent n」 — the
//               two sides equal (the page checks it adds up, and the main process gives the parts the total is made of), each library's
//               number the one its run funnel and the right panel count (its usage file). 「定时一览」 is gone (the right panel's 进度
//               lists each library's next run).
//   about       关于: 流息 version (Windows 版) + 检查更新 (screens/settings-update.js: the line when a new version is there, as before),
//               由 Starry Digital 开发 (opens starrydigital.ca, V11), 许可证与致谢 (the dialog); ▾ 高级 (folded): 显示开发者信息,
//               复制诊断信息 (the only place it is now: the banner's went, R2's three-button rule kept), 打开运行记录文件夹 (openLogsFolder).
// The API key dialog (P18) and 许可证与致谢 (P19) are the template's dialog (screens/t-dialog.js). The key goes from the field to the
// main process once (setApiKey → safeStorage); the page never gets it back (only its last four characters), no log, no library folder.
// The pieces 首次打开 and the problem card draw too are exported from here (detectWords, connectionState, needsLogin, probeView,
// LoginLoop, ProbeLine, ApiKeyDialog).
// Test hooks: main[data-screen="settings"]; [data-part="jumps"] [data-jump=connection|look|library|about]; [data-group=…] with
// [data-part=connections|agent-uses|theme|appearance|language|library-root|usage|about|advanced|made-by]; [data-connection=<kind>]
// [data-conn-state][data-active] with [data-conn-words], b (its name), select#settings-model-<kind>(-verify), [data-action=probe|
// use-connection|setup-key|login|login-again], [data-probe]; [data-usage-library=<id>][data-calls][data-self-check],
// [data-usage-agent][data-calls], [data-part="usage-sum"][data-sum]; [data-action=licenses|copy-diagnostics|open-logs]; the key
// dialog dialog[data-dialog="api-key"] with select[data-field="vendor"], input[data-field="base-url"|"key"], [data-action=save-key|
// remove-key|cancel-key]; dialog[data-dialog="licenses"] with [data-part=own|license-text|font|font-license-text|components|notices|
// licenses-made-by], [data-component=<name>], [data-action=open-notices|close-licenses]; the theme chips [data-theme-card=<id>]
// [data-checked] with input[name="theme"]; select[data-field="appearance"]; the language radios #settings-language-<setting>.
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
// v2 package L: the window's right panel (nothing chosen here: 详情 says so in one sentence)
import { RightPanel } from './right-panel.js'
import { CONNECTIONS, SEP } from '../texts/common.js'
import { SETTINGS as T } from '../texts/settings.js'
import { AboutUpdate } from './settings-update.js'
import { APPEARANCES, THEME_IDS } from '../../shared/themes.mjs'
import { applyLook } from '../lib/theme.js'
import { Btn, TDialog } from './t-dialog.js'

const KINDS = ['claude-code', 'codex', 'api']
const GROUPS = ['connection', 'look', 'library', 'about']

/** One word for a kind's state (getConnections().kinds[kind]): usable · not-logged-in · not-installed · no-key. */
export function connectionState(kind, k) {
  if (!k) return 'not-installed'
  if (kind === 'api') return k.hasKey ? 'usable' : 'no-key'
  if (!k.installed) return 'not-installed'
  return k.loggedIn ? 'usable' : 'not-logged-in'
}

/** Is the login loop (前往登录 …) shown for this kind? Only the two command-line tools, installed but not signed in. */
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
  if (probe.status === 'trying') return html`<small class="st-set-probe" data-probe="trying" role="status">${CONNECTIONS.probe.trying}</small>`
  if (probe.status === 'ok') return html`<small class="st-set-probe" data-probe="ok" role="status">${fmt(CONNECTIONS.probe.ok, { seconds: ((probe.result?.latencyMs ?? 0) / 1000).toFixed(1) })}</small>`
  return html`<small class="st-set-probe" data-probe="failed" role="status">${fmt(CONNECTIONS.probe.failed, { reason: reasonOf(probe.result) })}</small>`
}

/** 「前往登录」 + the line under it + 「已登录，重新检测」 (= detectConnections, through onRedetect). */
export function LoginLoop({ kind, busy, onRedetect }) {
  const [failed, setFailed] = useState(false)
  const open = async () => {
    setFailed(false)
    try { const r = await call('openLogin', kind); if (!r?.ok) setFailed(true) } catch { setFailed(true) }
  }
  return html`<div class="after-card st-set-login" data-part="login" data-kind=${kind}>
    <${Btn} name="login" kind="primary" disabled=${busy} onClick=${open}>${CONNECTIONS.login.go}<//>
    <small>${CONNECTIONS.login.note}</small>
    <${Btn} name="login-again" disabled=${busy} onClick=${onRedetect}>${CONNECTIONS.login.again}<//>
    ${failed ? html`<small role="alert">${CONNECTIONS.login.failed}</small>` : null}
  </div>`
}

/**
 * 「输入 API key」 (P18): the template's dialog — 厂商 (选择预设… / the bridge's presets / 自定义接口地址), 接口地址 (a custom one), key (sent
 * once, never shown), the sentence on where it is kept, 删除 API key · 取消 · 保存.
 */
export function ApiKeyDialog({ api, onClose, onChanged }) {
  const vendors = Array.isArray(api?.vendors) ? api.vendors : []
  // P18: 「选择预设…」 until a vendor is chosen (the one a saved key has, when there is one)
  const [vendor, setVendor] = useState(api?.hasKey ? api?.vendor ?? '' : '')
  const [baseUrl, setBaseUrl] = useState(api?.baseUrl ?? '')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const custom = vendor === 'custom'
  const save = async () => {
    if (key.trim() === '' || !vendor) return
    setBusy(true)
    setNote(null)
    try {
      await call('setApiVendor', vendor, custom ? baseUrl.trim() : null)
      await call('setApiKey', vendor, key.trim())
      setKey('')
      onChanged?.()
      onClose()
    } catch { setNote(T.apiDialog.failed) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    setNote(null)
    try {
      await call('removeApiKey', vendor || api?.vendor)
      onChanged?.()
      onClose()
    } catch { setNote(T.apiDialog.failed) } finally { setBusy(false) }
  }
  const preset = vendors.find(v => v.id === vendor) ?? null
  // P18: 删除 API key is always there, usable once a key is stored
  const footer = html`<${Btn} name="remove-key" disabled=${busy || !api?.hasKey} onClick=${remove}>${T.apiDialog.remove}<//>
    <span class="st-tdialog__gap"></span>
    <${Btn} name="cancel-key" kind="quiet" disabled=${busy} onClick=${onClose}>${T.apiDialog.cancel}<//>
    <${Btn} name="save-key" kind="primary" disabled=${busy || !vendor || key.trim() === '' || (custom && baseUrl.trim() === '')} onClick=${save}>${T.apiDialog.save}<//>`
  return html`<${TDialog} name="api-key" title=${T.apiDialog.title} closeLabel=${T.apiDialog.close} onClose=${onClose} footer=${footer}>
    ${api?.hasKey ? html`<p class="limit-note" data-has-key=${api.keyHint ?? ''}>${fmt(T.apiDialog.hasKey, { hint: api.keyHint ?? '' })}</p>` : null}
    <label class="field"><span>${T.apiDialog.vendor}</span>
      <select data-field="vendor" value=${vendor} onChange=${e => setVendor(e.currentTarget.value)}>
        <option value="" selected=${vendor === ''} disabled>${T.apiDialog.vendorPick}</option>
        ${vendors.map(v => html`<option key=${v.id} value=${v.id} selected=${v.id === vendor}>${v.label}</option>`)}
      </select></label>
    <label class="field"><span>${T.apiDialog.baseUrl}</span>
      <input type="url" data-field="base-url" placeholder=${T.apiDialog.baseUrlPlaceholder} value=${custom ? baseUrl : preset?.baseUrl ?? ''} readonly=${!custom} disabled=${!custom}
        onInput=${e => setBaseUrl(e.currentTarget.value)} /></label>
    <label class="field"><span>${T.apiDialog.key}</span>
      <input type="password" autocomplete="off" data-field="key" placeholder=${T.apiDialog.keyPlaceholder} value=${key} data-dialog-initial
        onInput=${e => setKey(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} /></label>
    <p class="limit-note" data-part="key-note">${T.apiDialog.note}</p>
    ${note ? html`<p class="progress-alert" role="alert">${note}</p>` : null}
  <//>`
}

/** One part of the page (one of the four jumps): the template's section-label, then its content. */
function Group({ id, name, hint = null, children }) {
  return html`<section class="st-set-group" data-group=${id} id=${`settings-group-${id}`} aria-labelledby=${`settings-group-${id}-h`}>
    <div class="section-label"><span id=${`settings-group-${id}-h`}>${name}</span>${hint ? html`<small class="muted">${hint}</small>` : null}</div>
    ${children}
  </section>`
}

function ModelSelect({ id, label, value, models, noneLabel, disabled, onChange }) {
  return html`<label class="st-set-slot" for=${id}>
    <span>${label}</span>
    <select id=${id} data-field=${id.endsWith('-verify') ? 'verify-model' : 'model'} value=${value ?? ''} disabled=${disabled} onChange=${e => onChange(e.currentTarget.value === '' ? null : e.currentTarget.value)}>
      <option value="" selected=${!value}>${noneLabel}</option>
      ${(models ?? []).map(m => html`<option key=${m.id} value=${m.id} selected=${m.id === value}>${m.label ?? m.id}</option>`)}
    </select>
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
  return html`<div data-part="connections">
    ${!data && conns.status === 'error' ? html`<p class="progress-alert" role="alert">${T.connectionsFailed}</p>` : null}
    ${data ? KINDS.map(kind => {
      const k = data.kinds?.[kind] ?? {}
      const state = connectionState(kind, k)
      const active = data.active === kind
      const words = [detectWords(kind, k)]
      if (state === 'usable' && !active) words.push(CONNECTIONS.usable)
      return html`<div key=${kind} class=${`file-row st-set-conn${active ? ' st-set-conn--active' : ''}`} data-connection=${kind} data-conn-state=${state} data-active=${String(active)}>
        <span class="file-icon"><${TIcon} name="spark" /></span>
        <span class="file-text st-set-conn__name"><b>${CONNECTIONS.names[kind]}</b><small data-conn-words>${words.join(SEP)}</small>
          ${kind === 'api' ? html`<small>${T.conn.apiHint}</small>` : null}</span>
        <span class="st-set-slots">
          <${ModelSelect} id=${`settings-model-${kind}`} label=${T.conn.model} value=${k.model ?? null} models=${k.models} noneLabel=${CONNECTIONS.defaultModel} disabled=${busy} onChange=${v => setModels(kind, k, { model: v })} />
          <${ModelSelect} id=${`settings-model-${kind}-verify`} label=${T.conn.verify} value=${k.verifyModel ?? null} models=${k.models} noneLabel=${CONNECTIONS.sameAsMain} disabled=${busy} onChange=${v => setModels(kind, k, { verifyModel: v })} />
        </span>
        <span class="st-set-conn__acts">
          ${active ? html`<span class="status-chip" data-part="in-use"><span class="dot"></span> ${T.conn.inUse}</span>`
            : html`<${Btn} name="use-connection" disabled=${busy || state !== 'usable'} onClick=${() => act(() => call('setActiveConnection', kind))}>${T.conn.use}<//>`}
          ${kind === 'api' ? html`<${Btn} name="setup-key" disabled=${busy} onClick=${() => setKeyDialog(true)}>${T.conn.setup}<//>` : null}
          <${Btn} name="probe" kind="quiet" disabled=${busy || state !== 'usable'} onClick=${() => probe(kind)}>${T.conn.probe}<//>
          <${ProbeLine} probe=${probes[kind] ?? probeView(data.probes?.[kind])} />
        </span>
        ${needsLogin(kind, k) ? html`<${LoginLoop} kind=${kind} busy=${busy} onRedetect=${redetect} />` : null}
      </div>`
    }) : null}
    <p class="limit-note" data-part="agent-uses">${T.conn.agentUses}</p>
    ${keyDialog ? html`<${ApiKeyDialog} api=${data?.kinds?.api ?? {}} onClose=${() => setKeyDialog(false)} onChanged=${redetect} />` : null}
  </div>`
}

/**
 * 「本月用量合计」 (维护者 11-05; redesign R4b, F65): getUsageTotal — the calls and the tokens of every library this month and the main
 * agent's, and the sum written out. The two sides are the main process's numbers; `data-sum` is what the parts add up to (the
 * page shows the total the main process gives, and the parts it is made of — the test checks they are equal).
 */
function UsagePart() {
  const usage = useLoad(() => call('getUsageTotal'), [])
  useEvent('inbox-changed', () => usage.reload())
  useEvent('libraries-changed', () => usage.reload())
  useEvent('agent-changed', p => { if (p?.phase === 'done') usage.reload() })
  const u = usage.data
  const U = T.usage
  const libs = Array.isArray(u?.libraries) ? u.libraries : []
  const agent = u?.agent?.calls ?? 0
  const sum = libs.reduce((n, l) => n + (l.calls ?? 0), 0) + agent
  const parts = u ? [
    ...libs.map(l => html`<span key=${l.id} data-usage-library=${l.id} data-calls=${l.calls} data-self-check=${l.selfCheck ?? 0}>${l.missing ? fmt(U.missing, { name: l.name }) : (l.selfCheck ?? 0) > 0 ? fmt(U.librarySelfCheck, { name: l.name, calls: l.calls, n: l.selfCheck }) : fmt(U.library, { name: l.name, calls: l.calls })}</span>`),
    html`<span key="agent" data-usage-agent data-calls=${agent}>${fmt(U.agent, { calls: agent })}</span>`,
  ] : []
  return html`<div data-part="usage" data-calls=${u?.calls ?? ''} data-month=${u?.month ?? ''}>
    ${!u && usage.status === 'error' ? html`<p class="progress-alert" role="alert">${U.failed}</p>` : null}
    ${u ? html`<p class="st-set-usage"><b data-part="usage-total">${fmt(U.total, { calls: u.calls })}</b><small>${fmt(U.tokens, { input: u.inputTokens, output: u.outputTokens })}</small></p>
      <p class="limit-note st-set-usage-sum" data-part="usage-sum" data-sum=${sum}>= ${parts.map((p, i) => html`${i ? U.plus : ''}${p}`)}</p>` : null}
  </div>`
}

/** 新建库默认存储位置 (v2 package I): getLibraryRoot; 「更改…」 = chooseLibraryRoot (the system's dialog); 「恢复默认」 = setLibraryRoot(null). */
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
  return html`<div class="file-row st-set-root" data-part="library-root">
    <span class="file-icon"><${TIcon} name="files" fallback="file" /></span>
    <span class="file-text">${R.label}<small data-root-default=${d ? String(d.isDefault === true) : ''}><span data-root-path=${d?.path ?? ''}>${d?.path ?? ''}</span>${d?.isDefault ? `${SEP}${R.isDefault}` : ''}</small>
      ${note ? html`<small role=${note === 'saved' ? 'status' : 'alert'} data-root-note=${note}>${R[note]}</small>` : null}
      ${!d && root.status === 'error' ? html`<small role="alert">${R.failed}</small>` : null}</span>
    <${Btn} name="change-root" disabled=${busy || !d} onClick=${() => act(() => call('chooseLibraryRoot'))}>${R.change}<//>
    <${Btn} name="reset-root" kind="quiet" disabled=${busy || !d || d.isDefault} onClick=${() => act(() => call('setLibraryRoot', null))}>${R.reset}<//>
  </div>`
}

/** 语言: 跟随系统（当前：中文） · 中文 · English — the template's filters, a radio each (v1.0's ids kept). */
function LanguagePart({ language, onChange }) {
  const setting = language?.setting ?? 'auto'
  const resolved = language?.resolved ?? 'zh-CN'
  return html`<div class="st-set-look" data-part="language">
    <div class="section-label"><span>${T.language}</span></div>
    <div class="filters" role="radiogroup" aria-label=${T.languageGroup}>
      ${['auto', 'zh-CN', 'en'].map(v => html`<label key=${v} class=${`filter${setting === v ? ' active' : ''}`} for=${`settings-language-${v}`} data-checked=${String(setting === v)}>
        <input type="radio" class="settings__choice-input" name="language" id=${`settings-language-${v}`} value=${v} checked=${setting === v} onChange=${() => onChange(v)} />
        <b>${T.languages[v]}</b>${v === 'auto' ? html`<small>${fmt(T.languageNow, { name: T.languages[resolved] })}</small>` : null}
      </label>`)}
    </div>
    <p class="limit-note">${T.languageNote}</p>
  </div>`
}

/**
 * 「外观与语言」's theme (docs/desktop.md §五「主题」). Redesign R1 (维护者 11-11; design 07-模板版 「设置」): the template's four
 * themes as the template's own choice chips (`.filters` of `.filter`, the current one `.active`), one radio each, 「默认」 on
 * the default. A choice is setTheme at once (lib/theme.js swaps the sheets; the reading window follows).
 */
function ThemePart({ theme, defaultTheme, failed, onChange }) {
  const current = THEME_IDS.includes(theme) ? theme : defaultTheme
  return html`<div class="st-set-look settings__look" data-part="theme">
    <div class="section-label"><span id="settings-theme">${T.theme}</span><small class="muted">${T.themeHint}</small></div>
    <div class="filters" role="radiogroup" aria-labelledby="settings-theme">
      ${THEME_IDS.map(id => html`<label key=${id} class=${`filter${id === current ? ' active' : ''}`} for=${`settings-theme-${id}`} data-theme-card=${id} data-checked=${String(id === current)}>
        <input type="radio" class="settings__choice-input" name="theme" id=${`settings-theme-${id}`} value=${id} checked=${id === current} onChange=${() => onChange(id)} />
        <b class="settings__theme-name">${T.themes[id]}</b>${id === defaultTheme ? html` <small data-default>${T.themeDefault}</small>` : null}
      </label>`)}
    </div>
    ${failed ? html`<p class="progress-alert" role="alert">${T.themeFailed}</p>` : null}
  </div>`
}

/** 「外观」: 浅色 · 深色 · 跟随系统 (Windows' light / dark, live) — the template's field with a select; a choice is setAppearance at once. */
function AppearancePart({ appearance, failed, onChange }) {
  const current = APPEARANCES.includes(appearance) ? appearance : 'system'
  return html`<div class="st-set-look settings__look" data-part="appearance">
    <div class="form-row">
      <label class="field" for="settings-appearance"><span>${T.appearance}</span>
        <select id="settings-appearance" data-field="appearance" aria-label=${T.appearanceGroup} value=${current} onChange=${e => onChange(e.currentTarget.value)}>
          ${['system', 'light', 'dark'].map(a => html`<option key=${a} value=${a} data-appearance-choice=${a} selected=${a === current}>${T.appearances[a]}</option>`)}
        </select>
        <small>${T.appearanceHint}</small>
      </label>
    </div>
    ${failed ? html`<p class="progress-alert" role="alert">${T.appearanceFailed}</p>` : null}
    <p class="limit-note">${T.themeNote}</p>
  </div>`
}

/**
 * 许可证与致谢 (P19, V11): the template's dialog — 流息本身 · MIT (its license in full), 界面字体 · Noto Sans SC（SIL Open Font License 1.1）
 * (its license, folded), 标题字体 · Noto Serif SC（SIL Open Font License 1.1） (redesign R6a: the heading font of 研究对话, its license folded
 * the same way; it also has its row in the table, with the version of the font file), 随附的第三方组件 (name, version, license),
 * 查看完整第三方声明, 关闭.
 */
function LicensesDialog({ onClose }) {
  const lic = useLoad(() => call('getLicenses'), [])
  const [failed, setFailed] = useState(false)
  const d = lic.data
  const L = T.licenses
  const open = async () => {
    setFailed(false)
    try { await call('openNotices') } catch { setFailed(true) }
  }
  // the interface font is its own line (R4b), not a row; redesign R6a: the heading font has its line too and keeps its row
  // 「Noto Serif SC · <version> · OFL-1.1」, the version read from the font file that ships
  const components = d ? d.components.filter(c => !d.font || c.name !== d.font.name) : []
  const oflName = license => (license === 'OFL-1.1' ? 'SIL Open Font License 1.1' : license)
  const footer = d ? html`<span data-part="notices" data-available=${String(d.notices.available === true)} class="st-tdialog__notices">
      <${Btn} name="open-notices" disabled=${d.notices.available !== true} onClick=${open}>${L.notices}<//>
      ${d.notices.available !== true ? html`<small data-notices-why>${L.noticesNone}</small>` : null}
      ${failed ? html`<small role="alert">${L.noticesFailed}</small>` : null}
    </span>
    <span class="st-tdialog__gap"></span>
    <${Btn} name="close-licenses" kind="primary" onClick=${onClose}>${L.close}<//>` : html`<${Btn} name="close-licenses" kind="primary" onClick=${onClose}>${L.close}<//>`
  return html`<${TDialog} name="licenses" title=${L.title} closeLabel=${L.close} onClose=${onClose} footer=${footer} className="st-licenses">
    ${!d && lic.status === 'error' ? html`<p class="progress-alert" role="alert">${L.failed}</p>` : null}
    ${d ? html`<section class="readable" data-part="own" data-license=${d.own.license}>
        <p><b>${fmt(L.own, { license: d.own.license })}</b></p>
        <pre class="st-license-text" data-part="license-text" tabindex="0">${d.own.text}</pre>
        <p data-part="licenses-made-by"><button type="button" class="st-link" onClick=${() => call('openMakerPage').catch(() => {})}>${T.madeBy}</button></p>
      </section>
      ${d.font ? html`<section class="readable" data-part="font" data-license=${d.font.license}>
        <p><b>${fmt(L.font, { name: d.font.name, license: oflName(d.font.license) })}</b></p>
        <details><summary>${L.fontText}</summary><pre class="st-license-text" data-part="font-license-text" tabindex="0">${d.font.text}</pre></details>
      </section>` : null}
      ${d.displayFont ? html`<section class="readable" data-part="display-font" data-license=${d.displayFont.license} data-version=${d.components.find(c => c.name === d.displayFont.name)?.version ?? ''}>
        <p><b>${fmt(L.displayFont, { name: d.displayFont.name, license: oflName(d.displayFont.license) })}</b></p>
        <details><summary>${L.fontText}</summary><pre class="st-license-text" data-part="display-font-license-text" tabindex="0">${d.displayFont.text}</pre></details>
      </section>` : null}
      <div class="section-label"><span id="settings-components">${L.components}</span></div>
      <table class="st-log st-components" data-part="components" aria-labelledby="settings-components">
        <thead><tr><th scope="col">${L.name}</th><th scope="col">${L.version}</th><th scope="col">${L.license}</th></tr></thead>
        <tbody>${components.map(c => html`<tr key=${c.name} data-component=${c.name} data-version=${c.version} data-license=${c.license}>
          <td>${c.name}</td><td>${c.version}</td><td>${c.license}</td>
        </tr>`)}</tbody>
      </table>` : null}
  <//>`
}

export function SettingsScreen() {
  const { appState } = useApp()
  const data = appState.data
  const [devInfo, setDevInfo] = useState(data?.showDeveloperInfo ?? false)
  const [copied, setCopied] = useState(false)
  const [logsFailed, setLogsFailed] = useState(false)
  const [themeFailed, setThemeFailed] = useState(false)
  const [appearanceFailed, setAppearanceFailed] = useState(false)
  const [licenses, setLicenses] = useState(false)
  useEffect(() => { if (data) setDevInfo(data.showDeveloperInfo) }, [data?.showDeveloperInfo])
  const changeTheme = async id => {
    setThemeFailed(false)
    try {
      const r = await call('setTheme', id)
      // at once, before the app state comes back (app.js keeps it in step from then on)
      applyLook({ theme: r.theme, scheme: r.scheme })
    } catch { setThemeFailed(true) }
    appState.reload()
  }
  // v2 package K2: 「外观」 — the answer says which set is in force now (for 跟随系统: what Windows uses)
  const changeAppearance = async a => {
    setAppearanceFailed(false)
    try {
      const r = await call('setAppearance', a)
      applyLook({ theme: r.theme, scheme: r.scheme })
    } catch { setAppearanceFailed(true) }
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
  const openLogs = async () => {
    setLogsFailed(false)
    try { await call('openLogsFolder') } catch { setLogsFailed(true) }
  }
  const jump = id => document.getElementById(`settings-group-${id}`)?.scrollIntoView({ block: 'start' })
  const version = data ? html`<span class="status-chip" data-part="version-chip">${fmt(data.devBuild ? T.versionDev : T.version, { version: data.version })}</span>` : null
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="settings" />`} panel=${html`<${RightPanel} />`}>
    <${Main} screen="settings" state=${data ? 'ready' : appState.status} labelledby="settings-title">
      <${TopBar} title=${T.title} subtitle=${T.subtitle} titleTag="h1" titleId="settings-title" actions=${version} />
      <div class="st-main__body thread-scroll st-set-body">
        <div class="new-content st-set">
          <nav class="filters st-set-jumps" data-part="jumps" aria-label=${T.jumpsLabel}>
            ${GROUPS.map(id => html`<button type="button" key=${id} class="filter" data-jump=${id} onClick=${() => jump(id)}>${T.groups[id]}</button>`)}
          </nav>
          <${Group} id="connection" name=${T.groups.connection}>
            ${data ? html`<${ConnectionsPart} />` : null}
          <//>
          <${Group} id="look" name=${T.groups.look}>
            ${data ? html`<${ThemePart} theme=${data.theme} defaultTheme=${data.defaultTheme} failed=${themeFailed} onChange=${changeTheme} />` : null}
            ${data ? html`<${AppearancePart} appearance=${data.appearance} failed=${appearanceFailed} onChange=${changeAppearance} />` : null}
            <${LanguagePart} language=${data?.language} onChange=${changeLanguage} />
          <//>
          <${Group} id="library" name=${T.groups.library}>
            ${data ? html`<${LibraryRootPart} /><${UsagePart} />` : null}
          <//>
          <${Group} id="about" name=${T.about}>
            <div class="file-row st-set-about" data-part="about">
              <span class="file-icon"><${TIcon} name="download" fallback="file" /></span>
              <span class="file-text">${data ? html`<${AboutUpdate} version=${data.version} devBuild=${data.devBuild} />` : null}
                <small data-part="made-by"><button type="button" class="st-link" onClick=${() => call('openMakerPage').catch(() => {})}>${T.madeBy}</button></small></span>
              <${Btn} name="licenses" onClick=${() => setLicenses(true)}>${T.licensesOpen}<//>
            </div>
            <details class="st-set-advanced" data-part="advanced">
              <summary class="section-label"><span>${T.advanced}</span><${TIcon} name="down" /></summary>
              <label class="st-nl-check st-set-dev" for="settings-dev-info"><input type="checkbox" id="settings-dev-info" checked=${devInfo} onChange=${e => toggleDevInfo(e.currentTarget.checked)} /> ${T.devInfo}</label>
              <p class="limit-note">${T.devInfoText}</p>
              <div class="form-footer st-set-adv-actions">
                <${Btn} name="copy-diagnostics" onClick=${copy}><${TIcon} name="copy" fallback="file" /> ${T.copyDiagnostics}<//>
                <${Btn} name="open-logs" onClick=${openLogs}>${T.openLogs}<//>
              </div>
              <p class="limit-note" role="status" data-part="diagnostics-note">${copied ? T.copied : T.diagnosticsText}</p>
              ${logsFailed ? html`<p class="progress-alert" role="alert">${T.openLogsFailed}</p>` : null}
            </details>
          <//>
          ${licenses ? html`<${LicensesDialog} onClose=${() => setLicenses(false)} />` : null}
        </div>
      </div>
    <//>
  <//>`
}
