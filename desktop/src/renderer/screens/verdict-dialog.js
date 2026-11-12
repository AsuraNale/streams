// 核验记录 (mockup S15; docs/desktop.md §4.2): a dialog with every check one item went through, as the core's verdictsFor
// gives them (getVerdicts(url): [{ node, round, ts, items: [{ item, kind, passed, evidence, claimed, claimedNotDone }] }]) — step by step,
// round by round: passed or not, rule or model check, the evidence. An item the model said it had done (claimed) that the
// check did not pass is marked on its own line: 「说做了其实没做」. The result line per step: passed or not and the
// rounds (and the calls, when the core gives them). A check's words come from the pipeline's checklists (getPipeline:
// the item's `desc`); one the pipeline does not list shows its id.
// Opened from 资料库 (the right panel, a kept note; a caught item):
//   html`<${VerdictDialog} url=${…} title=${…} onClose=${…} />`
// Redesign R2 (F30): 待看 no longer opens the dialog — the right panel's 详情 folds the same record in (VerdictBody, the dialog's
// content without the dialog), its summary line from verdictSummary (the check items of each step's last round).
// Words: texts/library.js VERDICTS; the steps' names: texts/common.js NODE_NAMES.
// Test hooks: [data-dialog="verdicts"][data-state], [data-verdict-node=<node>], [data-round=<n>] inside it,
// [data-check=<item>][data-passed][data-kind], [data-said-not-done=<item>], [data-part="verdict-result"][data-passed].
// v2 package H: a group the core marked with 「写给 AI 的话」 (verdictsFor's aiInstruction) puts one block on top:
// [data-part="ai-instruction"] with [data-ai-kind=rule|judge] lists of [data-ai-phrase] — the sentences found.
import { html } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { Act } from '../lib/action.js'
import { Dialog } from '../kit/index.js'
import { NODE_NAMES } from '../texts/common.js'
import { VERDICTS as T } from '../texts/library.js'

const nodeName = id => (Object.hasOwn(T.nodes, id) ? T.nodes[id] : Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)

/** The sentences of a 「写给 AI 的话」 mark (core aiInstructionMark): the rule's matched phrases, or the model check's evidence. */
export function aiPhrases(mark) {
  if (!mark || typeof mark !== 'object') return []
  const fromRule = Array.isArray(mark.matches) ? mark.matches.map(m => (typeof m?.phrase === 'string' ? m.phrase.trim() : '')).filter(Boolean) : []
  if (fromRule.length) return [...new Set(fromRule)]
  return typeof mark.evidence === 'string' && mark.evidence.trim() ? [mark.evidence.trim()] : []
}

/** The marks of the record (one per step that found something), their sentences together. */
function AiMarks({ groups }) {
  const marks = (Array.isArray(groups) ? groups : []).map(g => g?.aiInstruction).filter(m => m && typeof m === 'object')
  if (!marks.length) return null
  const rule = [...new Set(marks.filter(m => m.source === 'rule').flatMap(aiPhrases))]
  const judge = [...new Set(marks.filter(m => m.source !== 'rule').flatMap(aiPhrases))]
  const list = (kind, label, phrases) => (phrases.length ? html`<div class="vd-ai__list" data-ai-kind=${kind}>
    <div class="st-t-small st-t-sub">${label}</div>
    <ul>${phrases.map((p, i) => html`<li key=${i} data-ai-phrase=${p}>${p}</li>`)}</ul>
  </div>` : null)
  return html`<section class="vd-ai" data-part="ai-instruction" aria-labelledby="vd-ai-title">
    <h3 class="vd-ai__title st-t-strong" id="vd-ai-title">${T.ai.title}</h3>
    <p class="st-t-small st-t-sub">${T.ai.note}</p>
    ${list('rule', T.ai.rule, rule)}
    ${list('judge', T.ai.judge, judge)}
    ${rule.length || judge.length ? null : html`<p class="st-t-small st-t-muted">${T.ai.none}</p>`}
  </section>`
}
/** 「说做了其实没做」 as the core marks it (verdictsFor: claimedNotDone = claimed and not passed). */
const saidNotDone = it => it.claimedNotDone === true

function descriptions(pipeline) {
  const map = new Map()
  for (const node of pipeline?.config?.nodes ?? []) for (const c of node.checklist ?? []) if (typeof c?.id === 'string' && typeof c.desc === 'string') map.set(`${node.id}\n${c.id}`, c.desc)
  return map
}

/** The groups per step, in the order the core wrote them (a step run again later is its own group); the last one is the result. */
function byNode(groups) {
  const out = new Map()
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g || typeof g.node !== 'string') continue
    if (!out.has(g.node)) out.set(g.node, [])
    out.get(g.node).push(g)
  }
  return out
}

function Round({ node, group, next, words }) {
  const items = Array.isArray(group.items) ? group.items : []
  const rules = items.filter(i => i.kind === 'rule').length
  const checks = items.length - rules
  const failed = items.filter(i => !i.passed)
  return html`<section class="vd-round" data-round=${group.round}>
    <h3 class="vd-round__title st-t-small st-t-strong">${fmt(T.round, { n: group.round, rules, checks })}</h3>
    <ul class="vd-items">
      ${items.map((it, i) => html`<li key=${`${it.item}-${i}`} class="vd-item" data-check=${it.item} data-passed=${String(it.passed === true)} data-kind=${it.kind ?? ''}>
        <span class=${`vd-mark vd-mark--${it.passed ? 'pass' : 'fail'}`}>${it.passed ? T.passed : T.notPassed}</span>
        <span class="vd-item__text">
          <span>${words.get(`${node}\n${it.item}`) ?? it.item}</span>
          ${it.evidence ? html`<span class="st-t-small st-t-sub vd-item__evidence">${it.evidence}</span>` : null}
        </span>
        <span class="vd-kind st-t-tiny st-t-muted">${T.kinds[it.kind] ?? it.kind ?? ''}</span>
      </li>`)}
      ${items.filter(saidNotDone).map(it => html`<li key=${`said-${it.item}`} class="vd-item vd-item--said" data-said-not-done=${it.item}>
        <span class="vd-mark vd-mark--fail">${T.notPassed}</span>
        <span class="vd-item__text">${T.saidNotDone}</span>
      </li>`)}
    </ul>
    ${next && failed.length ? html`<p class="st-t-small st-t-sub vd-back">${fmt(T.sentBack, { n: group.round, k: failed.length })}</p>` : null}
  </section>`
}

/** Redesign R2: each step's check items in its last round ({ node, n }), in the order the core wrote them — 详情's summary line. */
export function verdictSummary(groups) {
  return [...byNode(groups).entries()].map(([node, gs]) => ({ node, n: Array.isArray(gs[gs.length - 1]?.items) ? gs[gs.length - 1].items.length : 0 }))
}

/** The record itself (what the dialog shows), for a place of its own (redesign R2: 待看's 详情). */
export function VerdictBody({ url }) {
  const data = useLoad(() => call('getVerdicts', url), [url])
  const pipeline = useLoad(() => call('getPipeline').catch(() => null), [])
  return html`<${Record} url=${url} data=${data} pipeline=${pipeline} />`
}

/**
 * @param {object} p
 * @param {string} p.url - the item (its address in the library's record)
 * @param {string} [p.title]
 * @param {() => void} p.onClose
 */
export function VerdictDialog({ url, title, onClose }) {
  const data = useLoad(() => call('getVerdicts', url), [url])
  const pipeline = useLoad(() => call('getPipeline').catch(() => null), [])
  const actions = html`<${Act} name="close-verdicts" onClick=${onClose}>${T.close}<//>`
  return html`<${Dialog} name="verdicts" title=${title ? fmt(T.subtitle, { node: T.title, title }) : T.title} onCancel=${onClose} actions=${actions}>
    <${Record} url=${url} data=${data} pipeline=${pipeline} />
  <//>`
}

function Record({ url, data, pipeline }) {
  const words = descriptions(pipeline.data)
  const nodes = byNode(data.data)
  const state = data.data ? 'ready' : data.status
  return html`
    <div class="vd" data-state=${state} data-url=${url}>
      ${data.status === 'loading' && !data.data ? html`<p class="st-t-small st-t-muted">${T.loading}</p>` : null}
      ${data.status === 'error' && !data.data ? html`<p class="st-t-small st-t-wait" role="alert">${data.error?.code === 'bad_arguments' ? T.none : T.failed}</p>` : null}
      ${data.data && !nodes.size ? html`<p class="st-t-small st-t-muted" data-part="verdicts-none">${T.none}</p>` : null}
      ${data.data ? html`<${AiMarks} groups=${data.data} />` : null}
      ${[...nodes.entries()].map(([node, groups]) => {
        const last = groups[groups.length - 1]
        const passed = (last.items ?? []).every(i => i.passed === true)
        const calls = groups.reduce((n, g) => (typeof g.calls === 'number' ? n + g.calls : n), 0)
        const hasCalls = groups.some(g => typeof g.calls === 'number')
        const result = fmt(hasCalls ? T.resultCalls : T.result, { passed: passed ? T.resultPassed : T.resultFailed, rounds: last.round ?? groups.length, calls })
        return html`<section key=${node} class="vd-node" data-verdict-node=${node} aria-label=${nodeName(node)}>
          <h3 class="vd-node__title st-t-strong">${nodeName(node)}</h3>
          ${groups.map((g, i) => html`<${Round} key=${`${node}-${g.round}-${i}`} node=${node} group=${g} next=${i < groups.length - 1} words=${words} />`)}
          <div class=${`vd-result${passed ? ' vd-result--pass' : ''}`} data-part="verdict-result" data-passed=${String(passed)} data-rounds=${last.round ?? groups.length}>${result}</div>
        </section>`
      })}
    </div>`
}
