// v2 package F: the graph view of a library's 资料库 tab (screens/library-frame.js: tab library, screen graph; ViewSwitch back to the
// list), otherwise as v1.0 had it.
// 图谱 (mockup S9; docs/desktop.md §4.2). The filters in the top bar: 最近 30 天 / 全部, 只看已收藏 / 全部条目, 显示 [[链接]].
// An SVG of three rows — topics · sources · items — where every node sits where the core's graph puts it: x and y are its
// `col` and `row` times a fixed spacing (no force layout, no animation), so the same data draws the same picture every
// time. A node's size follows its `count`; solid lines join a topic or a source to its items, dashed curves join items
// that [[link]] each other. A click on an item opens a box at the bottom right with its title, source, date, status and
// what it links to (readNote), and 「打开」 goes to that note in 资料库. More than 60 items: only the 60 most recent are
// drawn, and a line says so. Data: getGraph(filter); read again on `library-changed`.
// Test hooks: main[data-screen="graph"][data-state], svg[data-part="graph"][data-width][data-height][data-days][data-status][data-links] (the
// filters of the data drawn, as the core echoes them),
// g[data-node=<id>][data-kind][data-row][data-col][data-x][data-y][data-r], [data-edge=<from>|<to>][data-edge-kind],
// [data-filter=days|status|links][data-value][aria-pressed], [data-part=node-detail|limited], [data-action=open-node|close-node].
import { html, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { useLoad } from '../lib/use-load.js'
import { useEvent } from '../lib/use-events.js'
import { Act } from '../lib/action.js'
import { LinkButton, TopBar } from '../kit/index.js'
import { LibraryFrame, ViewSwitch } from './library-frame.js'
import { ERRORS, NOTE_STATUS } from '../texts/common.js'
import { GRAPH as T } from '../texts/graph.js'

// the fixed spacing: a node at (col, row) is drawn at (PAD_X + col × COL_GAP, PAD_Y + row × ROW_GAP)
export const COL_GAP = 132
export const ROW_GAP = 150
export const PAD_X = 104
export const PAD_Y = 44
export const MAX_ITEMS = 60
const LABEL_CHARS = 9
const ROWS = ['topic', 'source', 'item']

/** Where a node is drawn, from the core's row and col only. */
export const place = node => ({ x: PAD_X + node.col * COL_GAP, y: PAD_Y + node.row * ROW_GAP })
/** A node's radius from its count (an item counts 1). */
export const radius = node => Math.min(26, 7 + 4 * Math.sqrt(Math.max(0, Number(node.count) || 0)))
const short = s => { const chars = [...String(s ?? '')]; return chars.length > LABEL_CHARS ? `${chars.slice(0, LABEL_CHARS).join('')}…` : chars.join('') }

/**
 * The items to draw: all of them, or the 60 most recent. The graph's item nodes carry no date, so `dateOf(id)` gives it
 * (the index's date, read through getLibrary); the order kept is the core's, so the picture stays the core's layout.
 */
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

function Edge({ e, from, to }) {
  const a = place(from)
  const b = place(to)
  const key = `${e.from}|${e.to}`
  if (e.kind === 'link') {
    const dip = 46 + Math.min(40, Math.abs(b.x - a.x) / 8)
    return html`<path class="gr-edge gr-edge--link" data-edge=${key} data-edge-kind="link" d=${`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${a.y + dip} ${b.x} ${b.y}`} />`
  }
  return html`<line class=${`gr-edge gr-edge--${e.kind}`} data-edge=${key} data-edge-kind=${e.kind} x1=${a.x} y1=${a.y + radius(from)} x2=${b.x} y2=${b.y - radius(to)} />`
}

function Node({ n, selected, onPick }) {
  const { x, y } = place(n)
  const r = radius(n)
  const label = n.kind === 'item' ? short(n.label) : fmt(T.nodeLabel, { label: short(n.label), n: n.count ?? 0 })
  const full = n.unknown ? fmt(T.unknownTopic, { label: n.label }) : n.kind === 'item' ? n.label : fmt(T.nodeLabel, { label: n.label, n: n.count ?? 0 })
  const clickable = n.kind === 'item'
  const onKey = e => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(n) } }
  return html`<g class=${`gr-node gr-node--${n.kind}${n.unknown ? ' gr-node--unknown' : ''}${selected ? ' gr-node--selected' : ''}`}
    data-node=${n.id} data-kind=${n.kind} data-row=${n.row} data-col=${n.col} data-x=${x} data-y=${y} data-r=${r} data-count=${n.count ?? 0}
    tabindex=${clickable ? '0' : undefined} role=${clickable ? 'button' : undefined} aria-label=${full}
    onClick=${clickable ? () => onPick(n) : undefined} onKeyDown=${onKey}>
    <title>${full}</title>
    <circle cx=${x} cy=${y} r=${r} />
    <text class="gr-label" x=${x} y=${n.kind === 'item' ? y + r + 15 : y - r - 7} text-anchor="middle">${label}</text>
  </g>`
}

function Detail({ node, graph, onOpen, onClose }) {
  const id = node.id.replace(/^item:/, '')
  const note = useLoad(() => call('readNote', id), [id])
  const e = note.data?.entry ?? null
  const labels = new Map(graph.nodes.map(n => [n.id, n.label]))
  const linked = graph.edges.filter(x => x.kind === 'link' && x.from === node.id).map(x => labels.get(x.to) ?? x.to.replace(/^item:/, ''))
  return html`<section class="gr-detail" data-part="node-detail" data-node-id=${node.id} aria-label=${node.label} role="dialog">
    <div class="gr-detail__title st-t-strong">${e?.title ?? node.label}</div>
    ${e ? html`<div class="st-t-small st-t-sub">${fmt(T.detail.meta, { source: e.source_name ?? e.source ?? '', date: e.date ?? '', status: NOTE_STATUS[e.status] ?? e.status ?? '' })}</div>` : null}
    <div class="st-t-small st-t-sub" data-part="node-links">${linked.length ? fmt(T.detail.links, { titles: linked.join(T.detail.joiner) }) : T.detail.linksNone}</div>
    <div class="gr-detail__actions">
      <${Act} name="open-node" variant="primary" onClick=${() => onOpen(id)}>${T.detail.open}<//>
      <${Act} name="close-node" onClick=${onClose}>${T.detail.close}<//>
    </div>
  </section>`
}

function Toggle({ name, value, on, onClick, children }) {
  return html`<button type="button" class="gr-toggle" data-filter=${name} data-value=${value} aria-pressed=${String(on)} onClick=${onClick}>${children}</button>`
}

export function GraphScreen() {
  const { navigate } = useApp()
  const [days, setDays] = useState(null)
  const [status, setStatus] = useState('all')
  const [links, setLinks] = useState(true)
  const [picked, setPicked] = useState(null)
  const filter = { days, status, topics: [], links }
  const graph = useLoad(() => call('getGraph', filter), [days, status, links])
  useEvent('library-changed', () => graph.reload())
  const g = graph.data
  const all = Array.isArray(g?.nodes) ? g.nodes : []
  const items = all.filter(n => n.kind === 'item')
  // more than 60 items: their dates, to keep the most recent
  const many = items.length > MAX_ITEMS
  const dates = useLoad(() => (many ? Promise.all(['kept', 'authored'].map(v => call('getLibrary', v, { topics: [], days: null }))) : null), [many, g])
  const dateById = new Map((dates.data ?? []).flatMap(part => (part?.items ?? []).map(e => [`item:${e.id}`, e.date ?? ''])))
  const shownItems = drawnItems(items, id => dateById.get(id) ?? '')
  const shown = new Set([...all.filter(n => n.kind !== 'item'), ...shownItems].map(n => n.id))
  const nodes = all.filter(n => shown.has(n.id))
  const byId = new Map(nodes.map(n => [n.id, n]))
  const edges = (Array.isArray(g?.edges) ? g.edges : []).filter(e => byId.has(e.from) && byId.has(e.to))
  const cols = Math.max(1, ...nodes.map(n => n.col + 1))
  const width = PAD_X + (cols - 1) * COL_GAP + COL_GAP / 2 + 40
  const height = PAD_Y + 2 * ROW_GAP + 70
  const pickedNode = picked && byId.has(picked) ? byId.get(picked) : null
  const actions = html`<div class="gr-filters" role="group" aria-label=${T.filtersLabel}>
    <span class="gr-filters__pair">
      <${Toggle} name="days" value="30" on=${days === 30} onClick=${() => setDays(30)}>${T.days.recent}<//>
      <${Toggle} name="days" value="all" on=${days === null} onClick=${() => setDays(null)}>${T.days.all}<//>
    </span>
    <span class="gr-filters__pair">
      <${Toggle} name="status" value="kept" on=${status === 'kept'} onClick=${() => setStatus('kept')}>${T.status.kept}<//>
      <${Toggle} name="status" value="all" on=${status === 'all'} onClick=${() => setStatus('all')}>${T.status.all}<//>
    </span>
    <label class="gr-check"><input type="checkbox" data-filter="links" data-value=${String(links)} checked=${links} onChange=${e => setLinks(e.currentTarget.checked)} />${T.links}</label>
  </div>`
  return html`<${LibraryFrame} tab="library" screen="graph" state=${g ? 'ready' : graph.status} labelledby="graph-title">
      <${TopBar} title=${T.title} subtitle=${T.subtitle} titleTag="h2" titleId="graph-title"
        actions=${html`${actions}<${ViewSwitch} current="graph" onSelect=${v => { if (v === 'list') navigate('library') }} />`} />
      <div class="st-main__body gr-body">
        ${graph.status === 'error' && !g ? html`<div class="gr-error" role="alert">${graph.error?.code === 'no_library' ? ERRORS.noLibrary : T.loadFailed}<${LinkButton} onClick=${() => graph.reload()}>${ERRORS.retry}<//></div>` : null}
        ${g && items.length > shownItems.length ? html`<div class="st-t-small st-t-wait" data-part="limited" data-shown=${shownItems.length} data-total=${items.length}>${fmt(T.limited, { n: shownItems.length, total: items.length })}</div>` : null}
        ${g && !items.length ? html`<div class="st-t-small st-t-muted" data-part="graph-empty">${T.empty}</div>` : null}
        ${g ? html`<div class="gr-canvas">
          <svg class="gr-svg" data-part="graph" data-width=${width} data-height=${height} data-days=${String(g.filters?.days ?? 'all')} data-status=${g.filters?.status ?? ''} data-links=${String(g.filters?.links ?? '')} width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} role="group" aria-label=${T.graphLabel}>
            ${ROWS.map((r, i) => html`<text key=${r} class="gr-row-label" x="16" y=${PAD_Y + i * ROW_GAP + 4}>${T.rows[r]}</text>`)}
            <g class="gr-edges">${edges.map(e => html`<${Edge} key=${`${e.kind}:${e.from}|${e.to}`} e=${e} from=${byId.get(e.from)} to=${byId.get(e.to)} />`)}</g>
            <g class="gr-nodes">${nodes.map(n => html`<${Node} key=${n.id} n=${n} selected=${n.id === picked} onPick=${p => setPicked(p.id)} />`)}</g>
          </svg>
        </div>
        <p class="st-t-tiny st-t-muted gr-legend">${T.legend}</p>` : null}
        ${pickedNode ? html`<${Detail} key=${pickedNode.id} node=${pickedNode} graph=${{ nodes, edges }} onOpen=${id => navigate('library', { id })} onClose=${() => setPicked(null)} />` : null}
      </div>
  <//>`
}
