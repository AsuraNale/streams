// 核验记录 (mockup S15; docs/desktop.md §4.2): a dialog with every check one item went through, as the core's verdictsFor
// gives them (getVerdicts(url): [{ node, round, ts, items: [{ item, kind, passed, evidence, claimed, claimedNotDone }] }]) — step by step,
// round by round: passed or not, rule or model check, the evidence. An item the model said it had done (claimed) that the
// check did not pass is marked on its own line: 「说做了其实没做」. The result line per step: passed or not and the
// rounds (and the calls, when the core gives them). A check's words come from the pipeline's checklists (getPipeline:
// the item's `desc`); one the pipeline does not list shows its id.
// Opened from 资料库 (the right panel, a kept note; a caught item) and, once wired by the PM, from a card in 待看:
//   html`<${VerdictDialog} url=${…} title=${…} onClose=${…} />`
// Words: texts/library.js VERDICTS; the steps' names: texts/common.js NODE_NAMES.
// Test hooks: [data-dialog="verdicts"][data-state], [data-verdict-node=<node>], [data-round=<n>] inside it,
// [data-check=<item>][data-passed][data-kind], [data-said-not-done=<item>], [data-part="verdict-result"][data-passed].
import { html } from '../lib/html.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { Act } from '../lib/action.js'
import { Dialog } from '../kit/index.js'
import { NODE_NAMES } from '../texts/common.js'
import { VERDICTS as T } from '../texts/library.js'

const nodeName = id => (Object.hasOwn(T.nodes, id) ? T.nodes[id] : Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)
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

/**
 * @param {object} p
 * @param {string} p.url - the item (its address in the library's record)
 * @param {string} [p.title]
 * @param {() => void} p.onClose
 */
export function VerdictDialog({ url, title, onClose }) {
  const data = useLoad(() => call('getVerdicts', url), [url])
  const pipeline = useLoad(() => call('getPipeline').catch(() => null), [])
  const words = descriptions(pipeline.data)
  const nodes = byNode(data.data)
  const state = data.data ? 'ready' : data.status
  const actions = html`<${Act} name="close-verdicts" onClick=${onClose}>${T.close}<//>`
  return html`<${Dialog} name="verdicts" title=${title ? fmt(T.subtitle, { node: T.title, title }) : T.title} onCancel=${onClose} actions=${actions}>
    <div class="vd" data-state=${state} data-url=${url}>
      ${data.status === 'loading' && !data.data ? html`<p class="st-t-small st-t-muted">${T.loading}</p>` : null}
      ${data.status === 'error' && !data.data ? html`<p class="st-t-small st-t-wait" role="alert">${data.error?.code === 'bad_arguments' ? T.none : T.failed}</p>` : null}
      ${data.data && !nodes.size ? html`<p class="st-t-small st-t-muted" data-part="verdicts-none">${T.none}</p>` : null}
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
    </div>
  <//>`
}
