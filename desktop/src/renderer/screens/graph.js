// 图谱 — redesign R3 (docs/checks/2026-11-11-r3/contract.md R3-2; design 03-页面稿 P10, 07-模板版 streams/app.js 「图谱」; F40;
// 维护者 11-11 第 9 题): a view of 资料库 (tab library, screen graph; 列表 · 图谱 on its head line). One filter, the time range
// (最近 30 天 · 全部); 只看已收藏 / 全部条目 and 显示 [[链接]] are gone from the page and from the bridge (getGraph takes `days` only, the
// main process asks the core for every file and the links). The data is the core's graph (it reads the index: only what is a file
// of the library is drawn); only the drawing is this page's.
//   Three rows — 主题 → 来源 → 条目 — on the template's parts: each node is a `.filter` placed on the graph (`st-graph` / `st-node`,
//   design streams/streams.css), the rows' names `.eyebrow`. A row's nodes are spread evenly over the width, in the core's order
//   (its `col`), so the same data draws the same picture. The lines (an SVG under the nodes): a topic to the sources its items
//   come from and a source to its items (solid; an item with no source — a note of your own — straight from its topics, solid);
//   the [[links]] between items always, dashed. More than 60 items: the 60 most recent are drawn, and a line says so.
//   A node clicked is selected and the right panel's 详情 shows it: a topic (篇数, 关键词数, the items under it), a source (篇数, its
//   items), an item (来源 · 日期, what it links to and what links to it, 「在资料库中打开」); an item of those lists opens it in 资料库.
// Data: getGraph({ days }), getLibrary('all', { days }) (the items' dates and sources), getSources (the topics' keywords); read again
// on `library-changed`.
// Test hooks: main[data-screen="graph"][data-state], [data-part="view-switch"] [data-mode], [data-filter="days"][data-value=30|all]
// [aria-pressed] (the only filter), [data-part="graph"][data-days][data-width][data-height], [data-node=<id>][data-kind][data-row]
// [data-col][data-x][data-y][aria-pressed], [data-row-label=<row>], [data-edge=<from>|<to>][data-edge-kind=topic-source|source|
// topic|link][data-dashed], [data-part=limited|graph-empty]; 详情: [data-part="detail-graph"][data-node-id][data-kind] with
// [data-part=node-items|node-links|node-backlinks] [data-node-item=<id>], [data-action="open-node"].
import { html, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { TIcon } from '../lib/template-icons.js'
import { LibraryFrame, ViewSwitch } from './library-frame.js'
import { DetailBlock } from './right-panel.js'
import { ERRORS, SEP } from '../texts/common.js'
import { GRAPH as T } from '../texts/graph.js'
import { PANEL } from '../texts/panel.js'

export const MAX_ITEMS = 60
// the picture: rows at these heights (px), nodes spread over the width (x in % of it; the picture is at least COL px per node
// of its longest row wide, else the width of the page), the rows' names on the left
export const ROW_Y = Object.freeze([70, 290, 510])
export const HEIGHT = 580
export const LEFT = 10
export const COL = 150
const ROWS = ['topic', 'source', 'item']
const LABEL_CHARS = 14

/** The least width of the picture for the nodes drawn (px): every node of the longest row COL px apart. */
export const widthFor = nodes => Math.round(COL * Math.max(1, ...ROWS.map((_, r) => nodes.filter(n => n.row === r).length)) / (1 - LEFT / 100))

/** Where a node is drawn: x (% of the width) its place among the drawn nodes of its row (the core's col order), spread evenly; y its row's height (px). */
export function placeAll(nodes) {
  const out = new Map()
  for (const r of [0, 1, 2]) {
    const row = nodes.filter(n => n.row === r).sort((a, b) => a.col - b.col)
    const step = (100 - LEFT) / Math.max(1, row.length)
    row.forEach((n, i) => out.set(n.id, { x: Math.round((LEFT + step * (i + 0.5)) * 100) / 100, y: ROW_Y[r] }))
  }
  return out
}

/** The items to draw: all of them, or the 60 most recent (`dateOf(id)`), in the core's order. */
export function drawnItems(items, dateOf = () => '') {
  if (items.length <= MAX_ITEMS) return items
  const ranked = [...items].sort((a, b) => {
    const x = dateOf(a.id) ?? ''
    const y = dateOf(b.id) ?? ''
    return x < y ? 1 : x > y ? -1 : a.col - b.col
  })
  const keep = new Set(ranked.slice(0, MAX_ITEMS).map(n => n.id))
  return items.filter(n => keep.has(n.id))
}

/**
 * The lines drawn, from the core's edges: a topic → item edge becomes topic → that item's source (once per pair) when the item
 * has a source, else stays topic → item; source → item as it is; [[link]] item → item as it is (dashed).
 */
export function linesOf(edges, byId) {
  const sourceOf = new Map(edges.filter(e => e.kind === 'source').map(e => [e.to, e.from]))
  const out = []
  const seen = new Set()
  const push = (from, to, kind) => {
    const k = `${kind}:${from}|${to}`
    if (seen.has(k) || !byId.has(from) || !byId.has(to)) return
    seen.add(k)
    out.push({ from, to, kind })
  }
  for (const e of edges) {
    if (e.kind === 'topic') {
      const s = sourceOf.get(e.to)
      if (s) push(e.from, s, 'topic-source')
      else push(e.from, e.to, 'topic')
    } else push(e.from, e.to, e.kind)
  }
  return out
}

const short = s => { const chars = [...String(s ?? '')]; return chars.length > LABEL_CHARS ? `${chars.slice(0, LABEL_CHARS).join('')}…` : chars.join('') }

function Line({ l, at }) {
  const a = at.get(l.from)
  const b = at.get(l.to)
  if (!a || !b) return null
  const key = `${l.from}|${l.to}`
  if (l.kind === 'link') {
    const dip = 44 + Math.min(40, Math.abs(b.x - a.x))
    return html`<path data-edge=${key} data-edge-kind="link" data-dashed="true" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" d=${`M ${a.x} ${a.y + 14} Q ${(a.x + b.x) / 2} ${a.y + 14 + dip} ${b.x} ${b.y + 14}`} />`
  }
  return html`<path data-edge=${key} data-edge-kind=${l.kind} data-dashed="false" vector-effect="non-scaling-stroke" d=${`M ${a.x} ${a.y + 14} L ${b.x} ${b.y - 14}`} />`
}

function Node({ n, at, picked, authored, onPick }) {
  const p = at.get(n.id)
  const full = n.unknown ? fmt(T.unknownTopic, { label: n.label }) : authored ? fmt(T.authored, { label: n.label }) : n.kind === 'item' ? n.label : fmt(T.nodeLabel, { label: n.label, n: n.count ?? 0 })
  const label = n.kind === 'item' ? short(n.label) : fmt(T.nodeLabel, { label: short(n.label), n: n.count ?? 0 })
  return html`<button type="button" class=${`filter st-node${picked ? ' active' : ''}`} style=${{ left: `${p.x}%`, top: `${p.y}px` }}
    data-node=${n.id} data-kind=${n.kind} data-row=${n.row} data-col=${n.col} data-x=${p.x} data-y=${p.y} data-count=${n.count ?? 0}
    aria-pressed=${String(picked)} title=${full} aria-label=${full} onClick=${() => onPick(n.id)}>${label}</button>`
}

/** The right panel's 详情 of the node clicked (07-模板版 「图谱」: 主题：记忆评测 · 2 篇 · 关键词 8 个 · 该主题下的内容). */
function NodeDetail({ node, lines, nodes, entries, keywords, onOpen }) {
  const D = T.detail
  const byId = new Map(nodes.map(n => [n.id, n]))
  const itemsOf = ids => ids.map(id => entries.get(id.replace(/^item:/, '')) ?? { id: id.replace(/^item:/, ''), title: byId.get(id)?.label ?? id })
  const rows = (list, part) => html`<div class="panel-section" data-part=${part}>
    ${list.length ? list.map(it => html`<button type="button" key=${it.id} class="file-row" data-node-item=${it.id} onClick=${() => onOpen(it.id)}>
      <span class="file-icon"><${TIcon} name=${it.status === 'authored' ? 'note' : 'file'} fallback="file" /></span>
      <span class="file-text">${it.title}<small>${it.status === 'authored' ? D.authored : [it.date ?? '', it.source_name ?? ''].filter(Boolean).join(SEP)}</small></span><${TIcon} name="arrow" /></button>`)
      : html`<p class="limit-note">${D.itemsNone}</p>`}
  </div>`
  let title
  let meta
  let body
  if (node.kind === 'topic') {
    const ids = lines.filter(l => l.from === node.id && l.kind === 'topic').map(l => l.to)
    // a topic's items: the core's topic → item edges (the picture draws some of them through the source)
    const all = node.items
    title = fmt(D.topic, { label: node.label })
    meta = fmt(D.topicMeta, { n: node.count ?? 0, k: keywords.get(node.label) ?? 0 })
    body = html`<div class="section-label"><span>${D.topicItems}</span></div>${rows(itemsOf(all ?? ids), 'node-items')}`
  } else if (node.kind === 'source') {
    title = fmt(D.source, { label: node.label })
    meta = fmt(D.sourceMeta, { n: node.count ?? 0 })
    body = html`<div class="section-label"><span>${D.sourceItems}</span></div>${rows(itemsOf(lines.filter(l => l.from === node.id && l.kind === 'source').map(l => l.to)), 'node-items')}`
  } else {
    const e = entries.get(node.id.replace(/^item:/, '')) ?? null
    title = e?.title ?? node.label
    meta = e ? (e.status === 'authored' ? [D.authored, e.date ?? ''].filter(Boolean).join(SEP) : fmt(D.itemMeta, { source: e.source_name ?? '', date: e.date ?? '' })) : ''
    const to = lines.filter(l => l.kind === 'link' && l.from === node.id).map(l => l.to)
    const back = lines.filter(l => l.kind === 'link' && l.to === node.id).map(l => l.from)
    body = html`<div class="section-label"><span>${D.links}</span></div>${rows(itemsOf(to), 'node-links')}
      <div class="section-label"><span>${D.backlinks}</span></div>${rows(itemsOf(back), 'node-backlinks')}
      <span class="st-act st-rp-reveal" data-action="open-node"><button type="button" class="btn" onClick=${() => onOpen(node.id.replace(/^item:/, ''))}><${TIcon} name="arrow" /> ${D.open}</button></span>`
  }
  return html`<${DetailBlock} where=${PANEL.detail.where.graph} title=${title} part="detail-graph">
    <div class="st-rp-detail" data-part="node-detail" data-node-id=${node.id} data-kind=${node.kind}>
      ${meta ? html`<p class="limit-note" data-part="node-meta">${meta}</p>` : null}
      ${body}
    </div>
  <//>`
}

export function GraphScreen() {
  const { navigate } = useApp()
  const [days, setDays] = useState(null)
  const [picked, setPicked] = useState(null)
  const graph = useLoad(() => call('getGraph', { days }), [days])
  const files = useLoad(() => call('getLibrary', 'all', { topics: [], days }), [days])
  const sources = useLoad(() => call('getSources').catch(() => null), [])
  useEvent('library-changed', () => { graph.reload(); files.reload(); sources.reload() })
  const g = graph.data
  const all = Array.isArray(g?.nodes) ? g.nodes : []
  const entries = new Map((files.data?.items ?? []).map(e => [e.id, e]))
  const items = all.filter(n => n.kind === 'item')
  const shownItems = drawnItems(items, id => entries.get(id.replace(/^item:/, ''))?.date ?? '')
  const keep = new Set([...all.filter(n => n.kind !== 'item'), ...shownItems].map(n => n.id))
  const nodes = all.filter(n => keep.has(n.id))
  const byId = new Map(nodes.map(n => [n.id, n]))
  const coreEdges = Array.isArray(g?.edges) ? g.edges : []
  const lines = linesOf(coreEdges, byId)
  const width = widthFor(nodes)
  const at = placeAll(nodes)
  const keywords = new Map((sources.data?.topics ?? []).map(t => [t.name, Array.isArray(t.keywords) ? t.keywords.length : 0]))
  const pickedNode = picked && byId.has(picked) ? { ...byId.get(picked), items: byId.get(picked).kind === 'topic' ? coreEdges.filter(e => e.kind === 'topic' && e.from === picked && byId.has(e.to)).map(e => e.to) : null } : null
  const authored = id => entries.get(id.replace(/^item:/, ''))?.status === 'authored'
  const detail = pickedNode ? html`<${NodeDetail} key=${pickedNode.id} node=${pickedNode} lines=${lines} nodes=${nodes} entries=${entries} keywords=${keywords} onOpen=${id => navigate('library', { id })} />`
    : html`<div class="panel-summary"><span class="eyebrow">${PANEL.tabs.detail}</span><p class="st-rp-none" data-part="detail-none">${T.detail.none}</p></div>`
  const state = g ? 'ready' : graph.status
  return html`<${LibraryFrame} tab="library" screen="graph" state=${state} labelledby="graph-title" detail=${detail}>
    <div class="st-main__body st-graph-body">
      <div class="st-list st-graph-head">
        <div class="section-label st-lib-head">
          <span><b id="graph-title">${T.title}</b></span>
          <${ViewSwitch} current="graph" onSelect=${v => { if (v === 'list') navigate('library') }} />
          <span class="spacer"></span>
          <div class="filters" role="group" aria-label=${T.filtersLabel}>
            <button type="button" class=${`filter${days === 30 ? ' active' : ''}`} data-filter="days" data-value="30" aria-pressed=${String(days === 30)} onClick=${() => setDays(30)}>${T.days.recent}</button>
            <button type="button" class=${`filter${days === null ? ' active' : ''}`} data-filter="days" data-value="all" aria-pressed=${String(days === null)} onClick=${() => setDays(null)}>${T.days.all}</button>
          </div>
        </div>
        ${graph.status === 'error' && !g ? html`<div class="progress-alert" role="alert">${graph.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed} <button type="button" class="btn quiet" onClick=${() => graph.reload()}>${ERRORS.retry}</button></div>` : null}
        ${g && items.length > shownItems.length ? html`<p class="limit-note" data-part="limited" data-shown=${shownItems.length} data-total=${items.length}>${fmt(T.limited, { n: shownItems.length, total: items.length })}</p>` : null}
        ${g && !items.length ? html`<div class="empty-state" data-part="graph-empty"><${TIcon} name="file" /><b>${T.empty}</b></div>` : null}
      </div>
      ${g ? html`<div class="st-graph-scroll">
        <div class="st-graph" data-part="graph" role="group" aria-label=${T.graphLabel} data-days=${String(g.filters?.days ?? 'all')} data-width=${width} data-height=${HEIGHT}
          style=${{ minWidth: `${width}px`, height: `${HEIGHT}px` }}>
          <svg viewBox=${`0 0 100 ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor">
            ${lines.map(l => html`<${Line} key=${`${l.kind}:${l.from}|${l.to}`} l=${l} at=${at} />`)}
          </g></svg>
          ${ROWS.map((r, i) => html`<span key=${r} class="eyebrow st-node st-graph__row" data-row-label=${r} style=${{ left: '0px', top: `${ROW_Y[i]}px` }}>${T.rows[r]}</span>`)}
          ${nodes.map(n => html`<${Node} key=${n.id} n=${n} at=${at} picked=${n.id === picked} authored=${n.kind === 'item' && authored(n.id)} onPick=${id => setPicked(p => (p === id ? null : id))} />`)}
        </div>
        <p class="limit-note st-graph__legend">${T.legend}</p>
      </div>` : null}
    </div>
  <//>`
}
