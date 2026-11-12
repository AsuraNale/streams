// 评分环节 — redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-2; design 03-页面稿 P15, 07-模板版 「高级设置」; F51–F53): the
// first fold of 来源与要求's 高级设置 (GatesSection, drawn by screens/sources.js; v2 package F had it on 来源与要求 itself as 「关卡」).
// The template's parts: the seven nodes in one row (filters of filter buttons: the kind on top — 固定 · 脚本 · 评分环节 ① · 评分环节 ② ·
// 模型 · 固定 · 固定 — the name under it, a scoring step with its threshold), the line 「固定节点不可删除或修改；评分环节不向模型提供任何
// 工具。」 (limit-note), then two columns: the chosen step's settings — 提示词（可编辑） (field textarea; v1.0's 「给模型的要求」), the
// output form (read only: the software parses it), 通过阈值 (a number from 0 to 1; anything else is refused before sending, and the
// core refuses it too; 「手动修改后，『严格程度』将显示为『自定义』」), 材料 (仅标题、来源、摘要 / 读取正文), 模型可用的工具 (无: fixed),
// 校验规则 (🔒 the built-in rules 「内置规则，不可删除」 without a delete; the user's own can be added and deleted), 恢复默认 · 保存
// (savePipeline with the whole configuration getPipeline gave, edited), 单条测试 (one recently fetched item → previewNode: the score, the
// reason, the check; nothing is written to the record, the inbox or the checks) — and beside it 上次运行各环节数据 (getPipeline().lastRound),
// 近期放弃原因, 近期未通过核验的原因. The rules are not touched: a fixed node cannot be removed or changed (the core's locked-node), the
// scoring steps give the model no tool, a built-in rule cannot be removed. Words: texts/pipeline.js; the scores' names:
// texts/common.js NODE_NAMES.
// Test hooks: [data-part="gates"][data-state], [data-flow-node=<id>][data-kind][data-locked][aria-pressed],
// [data-part=editor|locked|preview|preview-result|round|reasons|failures|output|tools], [data-tools="none"], textarea[data-field="requirement"],
// input[data-field="threshold"], input[data-field="material"][value], [data-check=<id>][data-origin] with
// [data-action="remove-check"], input[data-field="check-desc"], select[data-field="preview-url"],
// [data-action=save|reset|add-check|preview|go-settings], [data-part="save-note"][data-kind], dialog[data-dialog="reset-pipeline"].
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { CONNECTIONS, DAY, ERRORS, FETCH_STATES, NODE_NAMES, NO_CONNECTION, SEP } from '../texts/common.js'
import { PIPELINE as T } from '../texts/pipeline.js'
import { Btn, TDialog } from './t-dialog.js'

const MODEL_KINDS = ['gate', 'summary']
const MIN_CHECK = 6
const clone = v => JSON.parse(JSON.stringify(v))
const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : Object.hasOwn(T.names, id) ? T.names[id] : id)
const scoreKeyOf = node => Object.entries(node?.output ?? {}).find(([, v]) => v === 'score')?.[0] ?? null
const enumKeysOf = node => Object.entries(node?.output ?? {}).filter(([, v]) => typeof v === 'string' && v.startsWith('enum:')).map(([k]) => k)

/** The pass threshold as typed: a number from 0 to 1, or null. */
export function readThreshold(text) {
  const s = String(text ?? '').trim()
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null
}

const markOf = (node, nodes) => {
  const i = nodes.filter(n => n.kind === 'gate').findIndex(n => n.id === node.id)
  return T.marks[i] ?? String(i + 1)
}
function gateTitle(node, nodes) {
  return fmt(T.gateName, { mark: markOf(node, nodes), name: nodeName(node.id) })
}

/** The seven nodes in one row (the template's filters): the kind, then the name (a scoring step: its threshold). */
function Strip({ nodes, current, onSelect }) {
  return html`<div class="filters st-gate-strip" role="group" aria-label=${T.stripLabel}>
    ${nodes.map(n => {
      const locked = n.kind === 'fixed'
      const kind = n.kind === 'gate' ? fmt(T.gateKind, { mark: markOf(n, nodes) }) : T.kinds[n.kind] ?? n.kind
      const name = n.kind === 'gate' ? fmt(T.gateLine, { name: nodeName(n.id), threshold: n.threshold }) : nodeName(n.id)
      return html`<button type="button" key=${n.id} class=${`filter st-gate-node${current === n.id ? ' active' : ''}`} data-flow-node=${n.id} data-kind=${n.kind} data-locked=${String(locked)}
        aria-pressed=${String(current === n.id)} title=${T.about[n.id] ?? ''} onClick=${() => onSelect(n.id)}>
        <small>${kind}</small><b>${name}</b>
      </button>`
    })}
  </div>`
}

function Checklist({ node, onChange }) {
  const [desc, setDesc] = useState('')
  const [note, setNote] = useState(null)
  const items = Array.isArray(node.checklist) ? node.checklist : []
  const add = () => {
    const text = desc.trim()
    if ([...text].length < MIN_CHECK) { setNote(T.editor.checkShort); return }
    setNote(null)
    const id = `user-${Date.now().toString(36)}`
    onChange([...items.filter(i => i.origin !== 'streams'), { id, desc: text, kind: 'judge', origin: 'user' }, ...items.filter(i => i.origin === 'streams')])
    setDesc('')
  }
  return html`<div class="st-gate-checks" data-part="checklist">
    <div class="section-label"><span>${T.editor.checklist}</span><small class="muted">${T.editor.baselineHint}</small></div>
    ${items.map(it => html`<div key=${it.id} class="step-line st-gate-check" data-check=${it.id} data-origin=${it.origin ?? 'user'}>
      <${TIcon} name=${it.origin === 'streams' ? 'lock' : 'check'} fallback="check" />
      <span>${it.desc ?? it.id}${it.origin === 'streams' ? html`<small class="muted">（${T.editor.baseline}）</small>` : html`<small class="muted"> · ${T.editor.kinds[it.kind] ?? it.kind ?? ''}</small>`}</span>
      ${it.origin === 'streams' ? null : html`<${Btn} name="remove-check" kind="quiet" label=${T.editor.removeCheck} onClick=${() => onChange(items.filter(x => x.id !== it.id))}>${T.editor.removeCheck}<//>`}
    </div>`)}
    <div class="st-gate-add">
      <label class="search-field"><${TIcon} name="plus" /><input data-field="check-desc" aria-label=${T.editor.checkPlaceholder} placeholder=${T.editor.checkPlaceholder} value=${desc}
        onInput=${e => setDesc(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} /></label>
      <${Btn} name="add-check" onClick=${add}>${T.editor.addCheck}<//>
    </div>
    ${note ? html`<p class="limit-note" role="alert">${note}</p>` : null}
  </div>`
}

function PreviewResult({ result, node, onSettings }) {
  if (!result) return null
  if (result.status === 'trying') return html`<p class="limit-note" data-part="preview-result" data-state="trying" role="status">${T.preview.trying}</p>`
  if (result.status === 'error') {
    if (result.code === 'no_connection') {
      return html`<div class="progress-alert" data-part="preview-result" data-state="no-connection" role="alert">
        <span>${NO_CONNECTION.text}</span>
        <${Btn} name="go-settings" onClick=${onSettings}>${NO_CONNECTION.go}<//>
      </div>`
    }
    return html`<p class="progress-alert" data-part="preview-result" data-state="error" role="alert">${T.preview.other}</p>`
  }
  const r = result.data ?? {}
  if (r.ok === false) {
    const reason = Object.hasOwn(CONNECTIONS.codes, r.code) ? CONNECTIONS.codes[r.code] : String(r.code ?? '')
    return html`<p class="progress-alert" data-part="preview-result" data-state="failed" data-code=${r.code ?? ''} role="alert">${fmt(T.preview.error, { reason })}</p>`
  }
  const out = r.output && typeof r.output === 'object' ? r.output : {}
  const key = scoreKeyOf(node)
  const v = r.verification ?? {}
  const failedItems = (Array.isArray(v.items) ? v.items : Array.isArray(v.failed) ? v.failed : []).filter(i => i && i.passed !== true)
  const passed = v.passed === true
  return html`<div class="st-gate-result" data-part="preview-result" data-state="done" data-passed=${String(passed)} role="status">
    ${key && typeof out[key] === 'number' ? html`<b data-preview-score=${out[key]}>${fmt(T.preview.score, { name: nodeName(key), score: out[key].toFixed(2) })}</b>` : null}
    ${enumKeysOf(node).filter(k => out[k] !== undefined).map(k => html`<span key=${k}>${fmt(T.preview.score, { name: nodeName(k), score: out[k] })}</span>`)}
    ${typeof out.what === 'string' ? html`<span>${fmt(T.preview.what, { what: out.what })}</span>` : null}
    ${Array.isArray(out.points) ? html`<ul>${out.points.map((p, i) => html`<li key=${i}>${p}</li>`)}</ul>` : null}
    ${typeof out.reason === 'string' ? html`<span>${fmt(T.preview.reason, { reason: out.reason })}</span>` : null}
    <span data-part="preview-check">${passed ? T.preview.passed : fmt(T.preview.failed, { n: failedItems.length })}</span>
    ${failedItems.length ? html`<ul>${failedItems.map((f, i) => html`<li key=${i}>${fmt(T.preview.failedItem, { item: f.desc ?? f.item ?? f.id ?? '', evidence: f.evidence ?? '' })}</li>`)}</ul>` : null}
    <small class="muted">${fmt(T.preview.calls, { n: r.calls ?? 0 })}</small>
  </div>`
}

function Preview({ node, dirty, caught, onSettings }) {
  const items = caught ?? []
  const [url, setUrl] = useState('')
  const [result, setResult] = useState(null)
  useEffect(() => { setResult(null) }, [node.id])
  useEffect(() => { if (!url && items.length) setUrl(items[0].url) }, [items.length])
  const go = async () => {
    if (!url) return
    setResult({ status: 'trying' })
    // an unsaved change is tried as it stands (product spec C3: change the prompt, test one, then save)
    try { setResult({ status: 'done', data: await call('previewNode', node.id, url, dirty ? node : null) }) } catch (err) { setResult({ status: 'error', code: err?.code ?? null }) }
  }
  return html`<section class="st-gate-preview" data-part="preview" aria-labelledby="pl-preview-title">
    <div class="section-label"><span id="pl-preview-title">${T.preview.title}</span></div>
    ${items.length ? html`<div class="form-row">
      <label class="field"><span>${T.preview.pick}</span>
        <select data-field="preview-url" value=${url} onChange=${e => setUrl(e.currentTarget.value)}>
          ${items.map(it => html`<option key=${it.url} value=${it.url} selected=${it.url === url}>${it.title}</option>`)}
        </select></label>
    </div>
    <div class="st-gate-row"><${Btn} name="preview" disabled=${!url || result?.status === 'trying'} onClick=${go}>${T.preview.go}<//></div>` : html`<p class="limit-note">${T.preview.none}</p>`}
    ${dirty ? html`<p class="limit-note" data-part="preview-dirty">${T.preview.dirty}</p>` : null}
    <${PreviewResult} result=${result} node=${node} onSettings=${onSettings} />
  </section>`
}

function Editor({ node, nodes, thresholdText, onThreshold, onChange, dirty, caught, onSettings, actions }) {
  const title = node.kind === 'gate' ? gateTitle(node, nodes) : nodeName(node.id)
  return html`<section class="st-gate-editor" data-part="editor" data-node-id=${node.id} aria-labelledby="pl-editor-title">
    <label class="field"><span id="pl-editor-title">${fmt(T.editor.requirementTitle, { name: title })}</span>
      <textarea data-field="requirement" rows="6" value=${node.requirement ?? ''} onInput=${e => onChange({ requirement: e.currentTarget.value })}></textarea>
      <small>${T.editor.requirementHint}</small></label>
    <p class="limit-note st-gate-output">${T.editor.output}：<code data-part="output">${JSON.stringify(node.output ?? {})}</code></p>
    ${node.kind === 'gate' ? html`
      <div class="form-row">
        <label class="field"><span>${T.editor.threshold}</span>
          <input data-field="threshold" inputmode="decimal" value=${thresholdText} onInput=${e => onThreshold(e.currentTarget.value)} />
          <small data-part="threshold-hint">${T.editor.thresholdHint}</small></label>
        <div class="field" role="radiogroup" aria-label=${T.editor.material}><span>${T.editor.material}</span>
          <div class="filters st-gate-material">
            ${['meta', 'body'].map(m => html`<label key=${m} class=${`filter${node.material === m ? ' active' : ''}`}>
              <input type="radio" class="settings__choice-input" name=${`pl-material-${node.id}`} data-field="material" value=${m} checked=${node.material === m} onChange=${() => onChange({ material: m })} />
              ${T.materials[m]}
            </label>`)}
          </div></div>
      </div>
    ` : null}
    <p class="limit-note" data-part="tools" data-tools="none">${T.editor.tools}：<b>${T.editor.toolsValue}</b> · ${T.editor.toolsHint}</p>
    <${Checklist} key=${node.id} node=${node} onChange=${checklist => onChange({ checklist })} />
    ${actions}
    <${Preview} node=${node} dirty=${dirty} caught=${caught} onSettings=${onSettings} />
  </section>`
}

function RoundPanel({ round, nodes }) {
  if (!round) return html`<p class="limit-note">${T.panel.roundNone}</p>`
  const counts = round.counts ?? {}
  const fetch = Array.isArray(round.fetch) ? round.fetch : []
  const byState = {}
  for (const f of fetch) byState[f.status] = (byState[f.status] ?? 0) + 1
  const lines = Object.entries(byState).map(([state, n]) => fmt(T.panel.fetchLine, { n, state: FETCH_STATES[state] ?? state })).join(SEP)
  const rows = []
  for (const n of nodes) {
    let text = null
    if (n.id === 'fetch') text = fmt(T.panel.fetch, { n: fetch.length, lines })
    else if (n.id === 'dedup') text = fmt(T.panel.dedup, { fetched: counts.fetched ?? 0, new: counts.new ?? 0 })
    else if (n.kind === 'gate') {
      const g = round.gates?.[n.id] ?? {}
      text = (g.unscored ?? 0) > 0 ? fmt(T.panel.gateUnscored, { passed: g.passed ?? 0, failed: g.failed ?? 0, unscored: g.unscored }) : fmt(T.panel.gate, { passed: g.passed ?? 0, failed: g.failed ?? 0 })
    } else if (n.kind === 'summary') text = (counts.verifyRejected ?? 0) > 0 ? fmt(T.panel.summaryRejected, { n: counts.summarized ?? 0, k: counts.verifyRejected }) : fmt(T.panel.summary, { n: counts.summarized ?? 0 })
    else if (n.id === 'decide') text = fmt(T.panel.decide, { n: counts.inbox ?? 0 })
    if (text !== null) rows.push(html`<div key=${n.id} class="st-gate-kv" data-round-node=${n.id}><span>${n.kind === 'gate' ? nodeName(n.id) : nodeName(n.id)}</span><b>${text}</b></div>`)
  }
  return html`${rows}<p class="limit-note">${T.panel.caughtNote}</p>`
}

/** 评分环节, the first fold of 高级设置. */
export function GatesSection() {
  const { navigate } = useApp()
  const data = useLoad(() => call('getPipeline'), [])
  const caught = useLoad(() => call('getLibrary', 'caught', { topics: [], days: null }).then(r => (r?.items ?? []).slice(0, 30)).catch(() => []), [])
  useEvent('library-changed', () => { data.reload(); caught.reload() })
  useEvent('inbox-changed', () => data.reload())
  const [draft, setDraft] = useState(null)
  const [texts, setTexts] = useState({})
  const [current, setCurrent] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
  const config = data.data?.config ?? null
  // a fresh copy to edit each time the saved configuration comes back
  useEffect(() => {
    if (!config) return
    setDraft(clone(config))
    setTexts(Object.fromEntries(config.nodes.filter(n => n.kind === 'gate').map(n => [n.id, String(n.threshold ?? '')])))
    if (!current || !config.nodes.some(n => n.id === current)) setCurrent(config.nodes.find(n => n.kind === 'gate')?.id ?? config.nodes[0]?.id ?? null)
  }, [JSON.stringify(config)])
  const nodes = draft?.nodes ?? []
  const node = nodes.find(n => n.id === current) ?? null
  const thresholdsChanged = nodes.some(n => n.kind === 'gate' && texts[n.id] !== undefined && texts[n.id] !== String(n.threshold ?? ''))
  const dirty = Boolean(config && draft) && (JSON.stringify(draft) !== JSON.stringify(config) || thresholdsChanged)
  const change = patch => setDraft(d => ({ ...d, nodes: d.nodes.map(n => (n.id === current ? { ...n, ...patch } : n)) }))

  const save = async (cfg = null) => {
    let out = cfg
    if (!out) {
      out = clone(draft)
      for (const n of out.nodes) {
        if (n.kind !== 'gate') continue
        const t = readThreshold(texts[n.id] ?? String(n.threshold ?? ''))
        if (t === null) { setCurrent(n.id); setNote({ kind: 'error', text: T.editor.thresholdBad }); return }
        n.threshold = t
      }
    }
    setBusy(true)
    setNote(null)
    try {
      await call('savePipeline', out)
      setNote({ kind: 'saved', text: T.saved })
      data.reload()
    } catch (err) {
      setNote({ kind: 'error', text: err?.code === 'bad_arguments' ? T.saveFailed : ERRORS.failed })
    } finally { setBusy(false) }
  }
  const defaults = data.data?.defaults ?? null
  const reset = async () => {
    setResetting(false)
    const byId = new Map((defaults?.nodes ?? []).map(n => [n.id, n]))
    const out = clone(config)
    out.nodes = out.nodes.map(n => {
      const def = byId.get(n.id)
      if (!MODEL_KINDS.includes(n.kind) || !def) return n
      const next = { ...n, checklist: (n.checklist ?? []).filter(i => i.origin === 'streams') }
      for (const k of ['requirement', 'threshold', 'material']) if (def[k] !== undefined) next[k] = def[k]
      return next
    })
    await save(out)
  }

  const reasons = Array.isArray(data.data?.dismissReasons) ? data.data.dismissReasons : []
  const failures = data.data?.verdictFailures && typeof data.data.verdictFailures === 'object' ? data.data.verdictFailures : {}
  const failureNodes = Object.keys(failures).filter(k => Array.isArray(failures[k]) && failures[k].length)
  const side = html`<aside class="st-gate-side" aria-label=${T.panel.round}>
      <section data-part="round" aria-labelledby="pl-round"><div class="section-label"><span id="pl-round">${T.panel.round}</span></div>
        ${data.data ? html`<${RoundPanel} round=${data.data.lastRound} nodes=${config?.nodes ?? []} />` : null}
      </section>
      <section data-part="reasons" aria-labelledby="pl-reasons"><div class="section-label"><span id="pl-reasons">${T.panel.reasons}</span></div>
        ${reasons.length ? reasons.map((r, i) => html`<div key=${i} class="activity-row" data-reason=${r.reason} title=${r.title ?? ''}>${r.reason}<small>${dayText(r.ts, DAY) ?? ''}</small></div>`)
          : html`<p class="limit-note">${T.panel.reasonsNone}</p>`}
      </section>
      <section data-part="failures" aria-labelledby="pl-failures"><div class="section-label"><span id="pl-failures">${T.panel.failures}</span></div>
        ${failureNodes.length ? failureNodes.map(id => {
          const n = (config?.nodes ?? []).find(x => x.id === id)
          const descOf = item => (n?.checklist ?? []).find(c => c.id === item)?.desc ?? item
          return html`<div key=${id} data-failures=${id}>
            <b class="st-gate-failnode">${n?.kind === 'gate' ? gateTitle(n, config.nodes) : nodeName(id)}</b>
            ${failures[id].map((f, i) => html`<div key=${i} class="activity-row" data-failure=${f.item}>${fmt(T.panel.failureLine, { item: descOf(f.item), evidence: f.evidence ?? '' })}</div>`)}
          </div>`
        }) : html`<p class="limit-note">${T.panel.failuresNone}</p>`}
      </section>
    </aside>`
  const actions = html`<div class="form-footer st-gate-footer">
    ${dirty ? html`<small data-part="unsaved">${T.unsaved}</small>` : null}
    <span title=${defaults ? null : T.resetUnavailable}><${Btn} name="reset" kind="quiet" disabled=${busy || !config || !defaults} onClick=${() => setResetting(true)}>${T.reset}<//></span>
    <${Btn} name="save" kind="primary" disabled=${busy || !dirty} onClick=${() => save()}>${busy ? T.saving : T.save}<//>
  </div>`
  const state = data.data && draft ? 'ready' : data.status === 'error' ? 'error' : 'loading'
  return html`<section class="st-gates" data-part="gates" data-state=${state} aria-label=${T.title}>
    ${data.status === 'error' && !data.data ? html`<div class="progress-alert" role="alert">${data.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}
      <${Btn} name="retry-gates" onClick=${() => data.reload()}>${ERRORS.retry}<//></div>` : null}
    ${draft ? html`
      <${Strip} nodes=${nodes} current=${current} onSelect=${id => setCurrent(id)} />
      <p class="limit-note st-gate-legend">${T.legend}</p>
      ${note ? html`<p class=${note.kind === 'saved' ? 'limit-note' : 'progress-alert'} role=${note.kind === 'saved' ? 'status' : 'alert'} data-part="save-note" data-kind=${note.kind}>${note.text}</p>` : null}
      <div class="st-gate-cols">
        <div class="st-gate-main">
          ${node && MODEL_KINDS.includes(node.kind)
            ? html`<${Editor} node=${node} nodes=${nodes} thresholdText=${texts[node.id] ?? ''} onThreshold=${v => setTexts(m => ({ ...m, [node.id]: v }))}
                onChange=${change} dirty=${dirty} caught=${caught.data} onSettings=${() => navigate('settings')} actions=${actions} />`
            : node ? html`<section class="st-gate-locked" data-part="locked" data-node-id=${node.id}>
                <div class="section-label"><span>${nodeName(node.id)}</span><small class="muted">${node.kind === 'fixed' ? T.kinds.fixed : T.kinds.script}</small></div>
                <p>${T.about[node.id] ?? ''}</p>
                <p class="limit-note">${node.kind === 'fixed' ? T.locked : ''}</p>
              </section>` : null}
        </div>
        ${side}
      </div>
    ` : null}
    ${resetting ? html`<${TDialog} name="reset-pipeline" title=${T.resetDialog.title} closeLabel=${T.resetDialog.close} onClose=${() => setResetting(false)}
      footer=${html`<${Btn} name="cancel-reset" kind="quiet" onClick=${() => setResetting(false)}>${T.resetDialog.cancel}<//><${Btn} name="confirm-reset" kind="primary" onClick=${reset}>${T.resetDialog.confirm}<//>`}>
      <div class="readable"><p>${T.resetDialog.text}</p></div>
    <//>` : null}
  </section>`
}
