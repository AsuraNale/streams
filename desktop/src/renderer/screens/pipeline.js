// 流水线 (mockup S4; docs/desktop.md §4.2) — v2 package F: no screen of its own any more, the 「关卡」 part of a library's 来源与要求
// (GatesSection, drawn by screens/sources.js; v1.0's right panel sits beside the editor). The strip of steps, joined by arrows: fixed (a lock and one line on what it
// does) · script · model steps · the summary · fixed. A model step chosen: its requirement (a textarea), its output form
// (read-only: the software parses it), the pass line (a number from 0 to 1: anything else is refused before sending, and
// the core refuses it too), the material (title and summary only / the body), the tools (fixed: none), the checklist (the
// baseline items marked 「底线」 and not removable; the user's own can be added and removed), 「试一条看结果」 (one recently
// caught item → previewNode: the score, the reason, the check; nothing is written to the record, the inbox or the
// checks), 「保存」 (savePipeline with the whole configuration as getPipeline gave it, edited), 「恢复默认」. The right panel:
// the last round per step (getPipeline().lastRound), the recent reasons for letting go, the recent reasons a check did not
// pass (per step). Words: texts/pipeline.js; the scores' names: texts/common.js NODE_NAMES.
// Test hooks: [data-part="gates"][data-state] (inside main[data-screen="sources"]), [data-flow-node=<id>][data-kind][data-locked][aria-pressed],
// [data-part=editor|locked|preview|preview-result|round|reasons|failures], textarea[data-field="requirement"],
// input[data-field="threshold"], input[data-field="material"][value], [data-check=<id>][data-origin] with
// [data-action="remove-check"], input[data-field="check-desc"], select[data-field="preview-url"],
// [data-action=save|reset|add-check|preview|go-settings], [data-part="save-note"][data-kind].
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { dayText, fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { Dialog, Icon, LinkButton, Tag } from '../kit/index.js'
import { CONNECTIONS, DAY, ERRORS, FETCH_STATES, NODE_NAMES, NO_CONNECTION, SEP } from '../texts/common.js'
import { PIPELINE as T } from '../texts/pipeline.js'
import { SHELL } from '../texts/shell.js'

const MODEL_KINDS = ['gate', 'summary']
const MIN_CHECK = 6
const clone = v => JSON.parse(JSON.stringify(v))
const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : Object.hasOwn(T.names, id) ? T.names[id] : id)
const scoreKeyOf = node => Object.entries(node?.output ?? {}).find(([, v]) => v === 'score')?.[0] ?? null
const enumKeysOf = node => Object.entries(node?.output ?? {}).filter(([, v]) => typeof v === 'string' && v.startsWith('enum:')).map(([k]) => k)

/** The pass line as typed: a number from 0 to 1, or null. */
export function readThreshold(text) {
  const s = String(text ?? '').trim()
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null
}

function gateTitle(node, nodes) {
  const gates = nodes.filter(n => n.kind === 'gate')
  const i = gates.findIndex(n => n.id === node.id)
  return fmt(T.gateName, { mark: T.marks[i] ?? String(i + 1), name: nodeName(node.id) })
}

function Strip({ nodes, current, onSelect }) {
  return html`<ol class="pl-strip" aria-label=${T.stripLabel}>
    ${nodes.map((n, i) => {
      const locked = n.kind === 'fixed'
      const name = n.kind === 'gate' ? gateTitle(n, nodes) : nodeName(n.id)
      const line = n.kind === 'gate' ? fmt(T.gateLine, { threshold: n.threshold, material: T.materials[n.material] ?? n.material }) : T.about[n.id] ?? ''
      return html`<li key=${n.id} class="pl-strip__item">
        ${i > 0 ? html`<span class="pl-strip__arrow" aria-hidden="true"><${Icon} name="chevron-right" size=${12} /></span>` : null}
        <button type="button" class=${`pl-node pl-node--${n.kind}`} data-flow-node=${n.id} data-kind=${n.kind} data-locked=${String(locked)}
          aria-pressed=${String(current === n.id)} onClick=${() => onSelect(n.id)}>
          <span class="pl-node__kind st-t-tiny">${locked ? html`<${Icon} name="lock" size=${10} />` : null}${T.kinds[n.kind] ?? n.kind}</span>
          <span class="pl-node__name st-t-strong">${name}</span>
          <span class="pl-node__line st-t-tiny">${line}</span>
        </button>
      </li>`
    })}
  </ol>`
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
  return html`<div class="pl-field" data-part="checklist">
    <span class="pl-field__label">${T.editor.checklist}</span>
    <ul class="pl-checks">
      ${items.map(it => html`<li key=${it.id} class="pl-check" data-check=${it.id} data-origin=${it.origin ?? 'user'}>
        <span class="pl-check__desc">${it.desc ?? it.id}</span>
        <span class="pl-check__kind st-t-tiny st-t-muted">${T.editor.kinds[it.kind] ?? it.kind ?? ''}</span>
        ${it.origin === 'streams' ? html`<${Tag} tone="recommend">${T.editor.baseline}<//>`
          : html`<${Act} name="remove-check" label=${T.editor.removeCheck} onClick=${() => onChange(items.filter(x => x.id !== it.id))}>${T.editor.removeCheck}<//>`}
      </li>`)}
    </ul>
    <div class="pl-checks__add">
      <input class="pl-input" data-field="check-desc" aria-label=${T.editor.addCheck} placeholder=${T.editor.checkPlaceholder} value=${desc}
        onInput=${e => setDesc(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
      <${Act} name="add-check" onClick=${add}>${T.editor.addCheck}<//>
    </div>
    ${note ? html`<div class="pl-error st-t-small" role="alert">${note}</div>` : null}
    <span class="st-t-tiny st-t-muted">${T.editor.baselineHint}</span>
  </div>`
}

function PreviewResult({ result, node, onSettings }) {
  if (!result) return null
  if (result.status === 'trying') return html`<div class="pl-preview__result st-t-small st-t-sub" data-part="preview-result" data-state="trying" role="status">${T.preview.trying}</div>`
  if (result.status === 'error') {
    if (result.code === 'no_connection') {
      return html`<div class="pl-preview__result" data-part="preview-result" data-state="no-connection" role="alert">
        <span class="st-t-small st-t-wait">${NO_CONNECTION.text}</span>
        <${Act} name="go-settings" onClick=${onSettings}>${NO_CONNECTION.go}<//>
      </div>`
    }
    return html`<div class="pl-preview__result st-t-small st-t-wait" data-part="preview-result" data-state="error" role="alert">${T.preview.other}</div>`
  }
  const r = result.data ?? {}
  if (r.ok === false) {
    const reason = Object.hasOwn(CONNECTIONS.codes, r.code) ? CONNECTIONS.codes[r.code] : String(r.code ?? '')
    return html`<div class="pl-preview__result st-t-small st-t-wait" data-part="preview-result" data-state="failed" data-code=${r.code ?? ''} role="alert">${fmt(T.preview.error, { reason })}</div>`
  }
  const out = r.output && typeof r.output === 'object' ? r.output : {}
  const key = scoreKeyOf(node)
  const v = r.verification ?? {}
  const failedItems = (Array.isArray(v.items) ? v.items : Array.isArray(v.failed) ? v.failed : []).filter(i => i && i.passed !== true)
  const passed = v.passed === true
  return html`<div class="pl-preview__result" data-part="preview-result" data-state="done" data-passed=${String(passed)} role="status">
    ${key && typeof out[key] === 'number' ? html`<div class="st-t-strong" data-preview-score=${out[key]}>${fmt(T.preview.score, { name: nodeName(key), score: out[key].toFixed(2) })}</div>` : null}
    ${enumKeysOf(node).filter(k => out[k] !== undefined).map(k => html`<div key=${k} class="st-t-small">${fmt(T.preview.score, { name: nodeName(k), score: out[k] })}</div>`)}
    ${typeof out.what === 'string' ? html`<div class="st-t-small">${fmt(T.preview.what, { what: out.what })}</div>` : null}
    ${Array.isArray(out.points) ? html`<ul class="pl-preview__points st-t-small">${out.points.map((p, i) => html`<li key=${i}>${p}</li>`)}</ul>` : null}
    ${typeof out.reason === 'string' ? html`<div class="st-t-small st-t-sub">${fmt(T.preview.reason, { reason: out.reason })}</div>` : null}
    <div class=${`st-t-small ${passed ? 'st-t-done' : 'st-t-wait'}`} data-part="preview-check">${passed ? T.preview.passed : fmt(T.preview.failed, { n: failedItems.length })}</div>
    ${failedItems.length ? html`<ul class="pl-preview__failed st-t-small st-t-sub">${failedItems.map((f, i) => html`<li key=${i}>${fmt(T.preview.failedItem, { item: f.desc ?? f.item ?? f.id ?? '', evidence: f.evidence ?? '' })}</li>`)}</ul>` : null}
    <div class="st-t-tiny st-t-muted">${fmt(T.preview.calls, { n: r.calls ?? 0 })}</div>
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
    // an unsaved change is tried as it stands (product spec C3: change the requirement, try one, then save)
    try { setResult({ status: 'done', data: await call('previewNode', node.id, url, dirty ? node : null) }) } catch (err) { setResult({ status: 'error', code: err?.code ?? null }) }
  }
  return html`<section class="pl-preview" data-part="preview" aria-labelledby="pl-preview-title">
    <h3 class="pl-field__label" id="pl-preview-title">${T.preview.title}</h3>
    ${items.length ? html`<div class="pl-preview__row">
      <select class="pl-input pl-preview__pick" data-field="preview-url" aria-label=${T.preview.pick} value=${url} onChange=${e => setUrl(e.currentTarget.value)}>
        ${items.map(it => html`<option key=${it.url} value=${it.url} selected=${it.url === url}>${it.title}</option>`)}
      </select>
      <${Act} name="preview" disabled=${!url || result?.status === 'trying'} onClick=${go}>${T.preview.go}<//>
    </div>` : html`<p class="st-t-small st-t-muted">${T.preview.none}</p>`}
    ${dirty ? html`<div class="st-t-small st-t-wait" data-part="preview-dirty">${T.preview.dirty}</div>` : null}
    <${PreviewResult} result=${result} node=${node} onSettings=${onSettings} />
  </section>`
}

function Editor({ node, nodes, thresholdText, onThreshold, onChange, dirty, caught, onSettings }) {
  const title = node.kind === 'gate' ? gateTitle(node, nodes) : nodeName(node.id)
  return html`<section class="pl-editor" data-part="editor" data-node-id=${node.id} aria-labelledby="pl-editor-title">
    <h3 class="pl-editor__title st-t-title" id="pl-editor-title">${title}</h3>
    <label class="pl-field">
      <span class="pl-field__label">${T.editor.requirement}</span>
      <textarea class="pl-textarea" data-field="requirement" rows="6" value=${node.requirement ?? ''} onInput=${e => onChange({ requirement: e.currentTarget.value })}></textarea>
    </label>
    <div class="pl-field">
      <span class="pl-field__label">${T.editor.output}</span>
      <code class="pl-code" data-part="output">${JSON.stringify(node.output ?? {})}</code>
    </div>
    ${node.kind === 'gate' ? html`
      <label class="pl-field pl-field--row">
        <span class="pl-field__label">${T.editor.threshold}</span>
        <input class="pl-input pl-input--short" data-field="threshold" inputmode="decimal" value=${thresholdText} onInput=${e => onThreshold(e.currentTarget.value)} />
        <span class="st-t-small st-t-sub">${T.editor.thresholdHint}</span>
      </label>
      <div class="pl-field" role="radiogroup" aria-label=${T.editor.material}>
        <span class="pl-field__label">${T.editor.material}</span>
        <div class="pl-radios">
          ${['meta', 'body'].map(m => html`<label key=${m} class="pl-radio">
            <input type="radio" name=${`pl-material-${node.id}`} data-field="material" value=${m} checked=${node.material === m} onChange=${() => onChange({ material: m })} />
            ${T.materials[m]}
          </label>`)}
        </div>
      </div>
    ` : null}
    <div class="pl-field">
      <span class="pl-field__label">${T.editor.tools}</span>
      <span><b>${T.editor.toolsValue}</b><span class="st-t-small st-t-sub pl-help">${T.editor.toolsHint}</span></span>
    </div>
    <${Checklist} key=${node.id} node=${node} onChange=${checklist => onChange({ checklist })} />
    <${Preview} node=${node} dirty=${dirty} caught=${caught} onSettings=${onSettings} />
  </section>`
}

function RoundPanel({ round, nodes }) {
  if (!round) return html`<p class="st-t-small st-t-muted">${T.panel.roundNone}</p>`
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
    if (text !== null) rows.push(html`<div key=${n.id} class="pl-kv__row" data-round-node=${n.id}><dt>${n.kind === 'gate' ? gateTitle(n, nodes) : nodeName(n.id)}</dt><dd>${text}</dd></div>`)
  }
  return html`<dl class="pl-kv">${rows}</dl><p class="st-t-tiny st-t-muted">${T.panel.caughtNote}</p>`
}

/** The 关卡 part of 来源与要求. `who`: 「谁定的」 of the pass lines (sources.js WhoLine), drawn under the heading. */
export function GatesSection({ who = null }) {
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
  const panel = html`<div class="pl-panel">
      <section class="pl-panel__block" data-part="round" aria-labelledby="pl-round"><h3 class="st-t-small st-t-sub st-t-strong" id="pl-round">${T.panel.round}</h3>
        ${data.data ? html`<${RoundPanel} round=${data.data.lastRound} nodes=${config?.nodes ?? []} />` : null}
      </section>
      <section class="pl-panel__block" data-part="reasons" aria-labelledby="pl-reasons"><h3 class="st-t-small st-t-sub st-t-strong" id="pl-reasons">${T.panel.reasons}</h3>
        <span class="st-t-tiny st-t-muted">${T.panel.reasonsHint}</span>
        ${reasons.length ? html`<ul class="pl-panel__list">${reasons.map((r, i) => html`<li key=${i} data-reason=${r.reason} title=${r.title ?? ''}>${r.reason}<span class="st-t-tiny st-t-muted">${SEP}${dayText(r.ts, DAY) ?? ''}</span></li>`)}</ul>`
          : html`<p class="st-t-small st-t-muted">${T.panel.reasonsNone}</p>`}
      </section>
      <section class="pl-panel__block" data-part="failures" aria-labelledby="pl-failures"><h3 class="st-t-small st-t-sub st-t-strong" id="pl-failures">${T.panel.failures}</h3>
        ${failureNodes.length ? failureNodes.map(id => {
          const n = (config?.nodes ?? []).find(x => x.id === id)
          const descOf = item => (n?.checklist ?? []).find(c => c.id === item)?.desc ?? item
          return html`<div key=${id} class="pl-panel__group" data-failures=${id}>
            <div class="st-t-small st-t-strong">${n?.kind === 'gate' ? gateTitle(n, config.nodes) : nodeName(id)}</div>
            <ul class="pl-panel__list">${failures[id].map((f, i) => html`<li key=${i} data-failure=${f.item}>${fmt(T.panel.failureLine, { item: descOf(f.item), evidence: f.evidence ?? '' })}</li>`)}</ul>
          </div>`
        }) : html`<p class="st-t-small st-t-muted">${T.panel.failuresNone}</p>`}
      </section>
    </div>`
  const actions = html`<div class="pl-actions">
    ${dirty ? html`<span class="st-t-small st-t-wait" data-part="unsaved">${T.unsaved}</span>` : null}
    <span title=${defaults ? null : T.resetUnavailable}><${Act} name="reset" disabled=${busy || !config || !defaults} onClick=${() => setResetting(true)}>${T.reset}<//></span>
    <${Act} name="save" variant="primary" disabled=${busy || !dirty} onClick=${() => save()}>${busy ? T.saving : T.save}<//>
  </div>`
  const state = data.data && draft ? 'ready' : data.status === 'error' ? 'error' : 'loading'
  return html`<section class="src-part pl-section" data-part="gates" data-state=${state} aria-labelledby="pipeline-title">
    <div class="src-part__head">
      <h2 class="st-t-small st-t-sub st-t-strong" id="pipeline-title">${SHELL.sources.gates}</h2>
      ${who}
      ${actions}
    </div>
    <p class="st-t-tiny st-t-muted">${SHELL.sources.gatesHint}</p>
    ${data.status === 'error' && !data.data ? html`<div class="pl-error" role="alert">${data.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => data.reload()}>${ERRORS.retry}<//></div>` : null}
    ${note ? html`<div class=${note.kind === 'saved' ? 'pl-note st-t-small st-t-done' : 'pl-error st-t-small'} role=${note.kind === 'saved' ? 'status' : 'alert'} data-part="save-note" data-kind=${note.kind}>${note.text}</div>` : null}
    ${draft ? html`
      <${Strip} nodes=${nodes} current=${current} onSelect=${id => setCurrent(id)} />
      <p class="st-t-tiny st-t-muted pl-legend">${T.legend}</p>
      <div class="pl-columns">
        <div class="pl-columns__main">
          ${node && MODEL_KINDS.includes(node.kind)
            ? html`<${Editor} node=${node} nodes=${nodes} thresholdText=${texts[node.id] ?? ''} onThreshold=${v => setTexts(m => ({ ...m, [node.id]: v }))}
                onChange=${change} dirty=${dirty} caught=${caught.data} onSettings=${() => navigate('settings')} />`
            : node ? html`<section class="pl-locked" data-part="locked" data-node-id=${node.id}>
                <h3 class="st-t-title">${nodeName(node.id)}</h3>
                <p class="st-t-small st-t-sub">${T.about[node.id] ?? ''}</p>
                <p class="st-t-small st-t-wait">${node.kind === 'fixed' ? T.locked : ''}</p>
              </section>` : null}
        </div>
        <aside class="pl-columns__side" aria-label=${T.panel.round}>${panel}</aside>
      </div>
    ` : null}
    ${resetting ? html`<${Dialog} name="reset-pipeline" title=${T.resetDialog.title} onCancel=${() => setResetting(false)}
      actions=${html`<${Act} name="cancel-reset" onClick=${() => setResetting(false)}>${T.resetDialog.cancel}<//><${Act} name="confirm-reset" variant="primary" onClick=${reset}>${T.resetDialog.confirm}<//>`}>
      <p class="st-dialog__text">${T.resetDialog.text}</p>
    <//>` : null}
  </section>`
}
