// The last run of a library as one funnel — redesign R2 (N10 · F18; design P06 · P08 · P16, 07-模板版 「待看空着时」): shown
// under an empty 待看 (screens/inbox.js) and in the right panel's 进度 (screens/right-panel.js), the same component on the same
// data, so both say the same numbers. It draws getHome().lastRun as the main process gives it (the core's runFunnel /
// failedStart, roundOutcome): the page computes no number.
//   已抓取（n 个来源）→ 去重后新增 → 通过相关度 → 通过实质 → 进入待看 — the template's mini-chart, one chart-row per cell, the
//   bar the share of what was fetched. A run that stopped stops at its cell: 「停」 there, 「—」 after it, and one line why
//   (P08: 「停 · 自检未通过：登录过期」). Then 「处理情况：收藏 a · 放弃 b · 稍后处理 c ｜ 模型调用 N 次 = 运行前自检 1 + 相关度 x +
//   实质 y + 摘要 z + 核验 w」 — N and the parts are the run record's (they add up: the core's callsBy); an older record without
//   its parts says the total only.
//   html`<${RunFunnel} lastRun=${home.data.lastRun} outcome=${true} />`
// Words: texts/run.js RUN; the steps' names: texts/common.js NODE_NAMES.
// Test hooks: [data-part="last-run"][data-state="ready"][data-complete][data-round], [data-funnel-cell=<id>][data-value][data-stop],
// [data-part="funnel-stop"][data-why][data-code], [data-part="funnel-outcome"][data-kept][data-dismissed][data-later],
// [data-part="funnel-calls"][data-total][data-parts] (data-parts: "self-check:1,gate:relevance:5,…" or "").
import { html } from '../lib/html.js'
import { fmt, whenText } from '../lib/format.js'
import { NODE_NAMES, WHEN } from '../texts/common.js'
import { RUN as T } from '../texts/run.js'

const nodeName = id => (Object.hasOwn(NODE_NAMES, id) ? NODE_NAMES[id] : id)

/** A cell's label (已抓取（n 个来源） · 去重后新增 · 通过<关卡> · 进入待看). */
function cellLabel(cell, sources) {
  if (cell.id === 'fetched') return sources > 0 ? fmt(T.cells.fetched, { n: sources }) : T.cells.fetchedPlain
  if (cell.id === 'new') return T.cells.new
  if (cell.id === 'inbox') return T.cells.inbox
  return fmt(T.cells.gate, { name: nodeName(cell.id.replace(/^gate:/, '')) })
}

/** What failed, in a few words (a connection's code, or the self-check's own problem). */
export function stopWhat(stop) {
  const code = stop?.connectionCode ?? null
  if (code && Object.hasOwn(T.what, code)) return T.what[code]
  if (stop?.code && stop.code !== 'connection' && Object.hasOwn(T.what, stop.code)) return T.what[stop.code]
  if (stop?.code === 'connection' && !code) return T.what.none
  // redesign R5b (O9): never the code itself
  return T.what.other
}

function stopLine(stop) {
  if (!stop) return ''
  const why = stop.why
  // precheck fix 5: a `why` the page has no words for is said in the page's words (never the word itself)
  const words = why === 'self-check' || why === 'connection' ? fmt(T.stopWhy[why], { what: stopWhat(stop) })
    : Object.hasOwn(T.stopWhy, why ?? '') && why !== 'other' ? T.stopWhy[why] : fmt(T.stopWhy.other, { what: stopWhat(stop) })
  return `${T.stopCell} · ${words}`
}

/** 模型调用 N 次 = 运行前自检 1 + 相关度 x + …, or the total alone when the record has no parts. */
export function callsLine(calls) {
  if (!calls) return null
  if (!Array.isArray(calls.parts)) return fmt(T.callsTotal, { n: calls.total })
  const name = id => (Object.hasOwn(T.parts, id) ? T.parts[id] : nodeName(id.replace(/^gate:/, '')))
  return fmt(T.calls, { n: calls.total, parts: calls.parts.map(p => fmt(T.part, { name: name(p.id), n: p.n })).join(T.plus) })
}

/**
 * @param {object} p
 * @param {{funnel: object, outcome: object|null}|null} p.lastRun - getHome().lastRun
 * @param {boolean} [p.outcome] - also 「处理情况」 (待看; the right panel leaves it out)
 * @param {boolean} [p.here] - the right panel's 「该库上次运行」 heading
 */
export function RunFunnel({ lastRun, outcome = true, here = false }) {
  const f = lastRun?.funnel ?? null
  if (!f) {
    return html`<section class="st-funnel" data-part="last-run" data-state="ready" data-complete="none">
      ${here ? html`<div class="section-label"><span>${T.lastHereNone}</span></div>` : null}
      <p class="limit-note" data-part="funnel-none">${T.none}</p>
    </section>`
  }
  const when = whenText(f.startedAt, WHEN) ?? ''
  const top = Math.max(1, ...f.cells.map(c => (typeof c.n === 'number' ? c.n : 0)))
  const o = lastRun.outcome
  const calls = callsLine(f.calls)
  const tail = [
    outcome && o ? html`<span data-part="funnel-outcome" data-kept=${o.kept} data-dismissed=${o.dismissed} data-later=${o.later}>${fmt(T.outcome, { kept: o.kept, dismissed: o.dismissed, later: o.later })}</span>` : null,
    calls ? html`<span data-part="funnel-calls" data-total=${f.calls.total} data-parts=${Array.isArray(f.calls.parts) ? f.calls.parts.map(p => `${p.id}:${p.n}`).join(',') : ''}>${calls}</span>` : null,
  ].filter(Boolean)
  return html`<section class="st-funnel" data-part="last-run" data-state="ready" data-complete=${String(f.complete)} data-round=${f.id ?? ''}>
    <div class="section-label"><span>${fmt(here ? (f.complete ? T.lastHere : T.lastHereStopped) : f.complete ? T.last : T.lastStopped, { when })}</span></div>
    <div class="mini-chart" data-part="funnel">
      ${f.cells.map(c => {
        const value = c.stop ? T.stopCell : typeof c.n === 'number' ? String(c.n) : T.empty
        const pct = typeof c.n === 'number' ? Math.round((c.n / top) * 100) : 0
        return html`<div key=${c.id} class=${`chart-row${c.stop ? ' st-funnel__stop' : ''}`} data-funnel-cell=${c.id} data-value=${typeof c.n === 'number' ? c.n : ''} data-stop=${String(Boolean(c.stop))}
          title=${c.skipped ? T.skipped : c.stop ? stopLine(f.stop) : undefined}>
          <span>${cellLabel(c, f.sources)}</span><div class="chart-track">${typeof c.n === 'number' ? html`<div class="chart-bar" style=${{ '--value': `${pct}%` }}></div>` : null}</div><b>${value}</b>
        </div>`
      })}
    </div>
    ${f.stop ? html`<p class="limit-note st-funnel__why" data-part="funnel-stop" data-why=${f.stop.why} data-code=${f.stop.connectionCode ?? f.stop.code ?? ''}>${stopLine(f.stop)}</p>` : null}
    ${tail.length ? html`<p class="limit-note">${tail.map((t, i) => html`${i ? T.sep : ''}${t}`)}</p>` : null}
  </section>`
}
