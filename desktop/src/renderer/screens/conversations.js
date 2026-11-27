// 1.1.3 (维护者 11-26 「每个库对应一个 session」「右侧框和聊天 session 的右键选择」; 赞妮's plan 对话与右键菜单-方案.md 第三、四、六、九节,
// her mock streams-sessions-mock.html): 主 Agent's column of conversations, the menus of a conversation and of a card, and
// the confirmation of 放弃.
//   ConversationList({ here })   「新建库」, then 「未建成」 (newest first; only when there is one), then 「我的库」 (the sidebar's
//                                order; a library never talked about: 暂无对话). Each row: its title, and what it is at (plan 3.6)
//                                with a mark at its head — the turning ring (working), a hollow dot (waiting), the accent dot
//                                (yours to answer or confirm, or 有新内容), the amber dot (cannot be confirmed yet, not sent,
//                                ended); 「更多」 at its end (on hover or focus) and a right click open its menu. On top once
//                                after the upgrade: the note and 知道了.
//   convMenuItems(row, app)      菜单一 (a library's conversation) / 菜单二 (one not built yet): plan 9.2, 9.3
//   useConvActions()             { run(id, row), ask(row), dialog }: what a menu item does; ask(row) — 放弃 with the plan's
//                                confirmation (6.3: always for 放弃建库, for 放弃修改 / 转换 when a card waits)
//   DropDialog                   the confirmation (screens/t-dialog.js; the button says the action itself)
// Test hooks: nav[data-part=conversations] with [data-action=conv-new], [data-part=organised] with [data-action=organised-ok],
// [data-conv-group=unbuilt|libraries], [data-conv=<id>][data-state=<state>][data-new][aria-current] (the row; its button
// .st-conv__main, its line [data-part=conv-line], its mark [data-mark=ring|hollow|accent|amber]), [data-action=conv-more];
// the menu's [data-menu-item=view-card|open-library|stop|drop]; dialog[data-dialog=drop-open] with [data-action=drop-confirm].
import { html, useRef, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt, whenText } from '../lib/format.js'
import { TIcon } from '../lib/template-icons.js'
import { Menu } from '../kit/index.js'
import { WHEN } from '../texts/common.js'
import { BUILD as T } from '../texts/build.js'
import { TDialog, Btn } from './t-dialog.js'

const L = T.list
const whenOf = iso => (iso ? whenText(iso, WHEN) ?? '' : '')
const ACTIVE = Object.freeze(['working', 'waiting'])

/** The second line of a row (plan 3.6). */
export function stateLine(row) {
  const S = L.states
  switch (row.state) {
    case 'working': return S.working
    case 'waiting': return fmt(S.waiting, { n: row.position ?? 1 })
    case 'question': return fmt(S.question, { n: row.n ?? 1 })
    case 'card': return S.card
    case 'card-blocked': return S['card-blocked']
    case 'replied': return fmt(S.replied, { when: whenOf(row.lastAt) })
    case 'unsent': return S.unsent
    case 'ended': return S.ended
    case 'idle': return row.last ? fmt(L.lastAt, { what: T.modes[row.last.mode] ?? row.last.mode, end: T.ends[row.last.why] ?? row.last.why ?? '', when: whenOf(row.last.endedAt) }) : L.none
    default: return L.none
  }
}

/** The mark at the head of a row's line; null: none (plan 3.6 — an idle row has no dot, unlike the sidebar's). */
export function markOf(row, isNew = false) {
  if (row.state === 'working') return 'ring'
  if (row.state === 'waiting') return 'hollow'
  if (['card-blocked', 'unsent', 'ended'].includes(row.state)) return 'amber'
  if (['question', 'card'].includes(row.state)) return 'accent'
  if (row.state === 'replied' && isNew) return 'accent'
  return null
}

export function Mark({ kind }) {
  if (!kind) return null
  if (kind === 'ring') return html`<span class="st-mo-ring" data-mark="ring" data-mo="conv" aria-hidden="true"></span>`
  return html`<span class=${`st-conv__dot st-conv__dot--${kind}`} data-mark=${kind} aria-hidden="true"></span>`
}

/** The words of a thing's 放弃 by what it is (三个现有的词: 放弃建库 · 放弃修改 · 放弃转换). */
export function dropWords(mode) {
  return mode === 'convert' ? T.convert.drop : mode === 'edit' ? T.dropEdit : T.drop
}
/** A library's conversation's mode: the thing open, else what a new one would be (edit with a card, convert without). */
const modeOfRow = row => row.mode ?? (row.kind === 'unbuilt' ? 'create' : row.hasCard === false ? 'convert' : 'edit')

/** 菜单一 / 菜单二 (plan 9.2, 9.3): hidden when the conversation can never use an item, greyed while it cannot now. */
export function convMenuItems(row, app) {
  const M = T.menu
  const stop = { id: 'stop', label: row.state === 'waiting' ? M.leave : M.stop, disabled: !ACTIVE.includes(row.state) }
  if (row.kind === 'unbuilt') return [stop, { id: 'drop', label: T.drop, danger: true }]
  const lib = (app?.libraries?.data ?? []).find(l => l.id === row.library?.id)
  return [
    ...(row.hasCard ? [{ id: 'view-card', label: M.viewCard }] : []),
    { id: 'open-library', label: M.openLibrary, disabled: lib?.exists === false },
    stop,
    { id: 'drop', label: dropWords(modeOfRow(row)), danger: true, disabled: !row.open },
  ]
}

/** The confirmation of 放弃 (plan 6.3, 第十三节). */
export function DropDialog({ mode, name, onConfirm, onClose }) {
  const D = T.dropDialog[mode] ?? T.dropDialog.create
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const go = async () => {
    setBusy(true)
    setFailed(false)
    try { await onConfirm(); onClose() } catch { setFailed(true); setBusy(false) }
  }
  return html`<${TDialog} name="drop-open" title=${D.title} closeLabel=${T.dropDialog.close} onClose=${onClose}
    footer=${html`<${Btn} name="drop-cancel" kind="quiet" disabled=${busy} onClick=${onClose}>${T.dropDialog.cancel}<//><${Btn} name="drop-confirm" kind="primary" busy=${busy} onClick=${go}>${D.confirm}<//>`}>
    <p data-part="drop-text">${fmt(D.text, { name: name ?? '' })}</p>
    ${failed ? html`<p class="progress-alert" role="alert">${T.failedCall}</p>` : null}
  <//>`
}

/**
 * What the menus' items and the header's buttons do, the same everywhere (plan 6.2: page head, the column's menu, the right
 * panel's card and its menu). x: { id, kind, mode, open, state, library, title, card? } — a row of listConversations, a view,
 * or a card of the right panel (card: true: 放弃 is always confirmed).
 */
export function useConvActions() {
  const app = useApp()
  const [asking, setAsking] = useState(null)
  const [note, setNote] = useState(null)
  const after = (id, out) => {
    app.conversations?.reload?.()
    // the words a stop gave back of a new conversation's first sentence: they go to the 新建库 page's box
    if (out && out.gone && typeof out.back === 'string') app.drafts?.add?.('new', out.back)
    if (out && out.gone && app.route?.screen === 'build' && app.route?.params?.conv === id) app.navigate('build', {})
  }
  const drop = async x => {
    await call('dropBuild', x.id)
    after(x.id, null)
    if (x.kind === 'unbuilt' && app.route?.screen === 'build' && app.route?.params?.conv === x.id) app.navigate('build', { latest: true })
  }
  const ask = x => {
    const mode = modeOfRow(x)
    const waiting = x.card === true || x.kind === 'unbuilt' || ['card', 'card-blocked'].includes(x.state) || x.waitingCard === true
    if (waiting) setAsking({ x, mode })
    else return drop(x).catch(() => setNote(T.failedCall))
    return null
  }
  const run = async (item, x) => {
    setNote(null)
    try {
      if (item === 'view-card') await app.openLibrary(x.library.id, { screen: 'sources', params: {} })
      else if (item === 'open-library') await app.openLibrary(x.library.id, { screen: 'inbox', params: {} })
      else if (item === 'stop') after(x.id, await call('stopBuild', x.id))
      else if (item === 'drop') await ask(x)
    } catch { setNote(T.failedCall) }
  }
  const dialog = asking ? html`<${DropDialog} mode=${asking.mode} name=${asking.x.library?.name ?? asking.x.title ?? ''}
    onConfirm=${() => drop(asking.x)} onClose=${() => setAsking(null)} />` : null
  return { run, ask, dialog, note }
}

/** One row of the column; `menuAt` opens its menu at a point (null: at its 「更多」). */
function Row({ row, current, isNew, onOpen, onMenu }) {
  const more = useRef(null)
  const atButton = () => { const r = more.current?.getBoundingClientRect(); onMenu(row, r ? r.right - 190 : 0, r ? r.bottom + 4 : 0, more.current) }
  return html`<div class=${`st-conv${current ? ' is-current' : ''}`} data-conv=${row.id} data-state=${row.state} data-new=${isNew ? 'true' : undefined}
    aria-current=${current ? 'page' : undefined}
    onContextMenu=${e => { e.preventDefault(); onMenu(row, e.clientX, e.clientY, more.current) }}>
    <button type="button" class="st-conv__main" onClick=${() => onOpen(row)}
      onKeyDown=${e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); atButton() } }}>
      <b>${row.title || (row.kind === 'unbuilt' ? T.title : '')}</b>
      <small><${Mark} kind=${markOf(row, isNew)} /><span data-part="conv-line">${stateLine(row)}</span></small>
    </button>
    <span class="st-act st-conv__more" data-action="conv-more"><button type="button" class="icon-btn" ref=${more} aria-label=${`${T.menu.more}${row.title ? ` · ${row.title}` : ''}`} aria-haspopup="menu"
      onClick=${atButton} onKeyDown=${e => { if (e.key === 'ContextMenu') { e.preventDefault(); atButton() } }}><span class="st-more-dots" aria-hidden="true">⋯</span></button></span>
  </div>`
}

/** 主 Agent's column; `here`: the conversation shown (its id), or 'new' for the 新建库 page. */
export function ConversationList({ here }) {
  const app = useApp()
  const list = app.conversations
  const d = list?.data ?? null
  const acts = useConvActions()
  const [menu, setMenu] = useState(null)
  const open = row => app.openConversation(row.id)
  const onMenu = (row, x, y, back) => setMenu({ row, x, y, back })
  const rowOf = r => html`<${Row} key=${r.id} row=${r} current=${here === r.id} isNew=${app.fresh?.has?.(r.id) === true} onOpen=${open} onMenu=${onMenu} />`
  return html`<nav class="st-convs" aria-label=${L.label} data-part="conversations">
    ${d?.organised ? html`<div class="st-convs__note" data-part="organised" role="note"><p>${L.organised}</p>
      <span class="st-act" data-action="organised-ok"><button type="button" class="btn quiet" onClick=${async () => { try { await call('dismissConversationsNote') } finally { list.reload() } }}>${L.gotIt}</button></span></div>` : null}
    <span class="st-act" data-action="conv-new"><button type="button" class="btn st-convs__new" aria-current=${here === 'new' ? 'page' : undefined} onClick=${() => app.newLibrary()}><${TIcon} name="plus" fallback="add" /> ${L.new}</button></span>
    ${list?.status === 'error' && !d ? html`<p class="st-convs__none" role="alert">${L.failed}</p>` : null}
    ${d?.unbuilt?.length ? html`<div class="st-convs__group" data-conv-group="unbuilt"><div class="st-convs__label">${L.unbuilt}</div>${d.unbuilt.map(rowOf)}</div>` : null}
    ${d ? html`<div class="st-convs__group" data-conv-group="libraries"><div class="st-convs__label">${L.libraries}</div>${(d.libraries ?? []).map(rowOf)}</div>` : null}
    ${acts.note ? html`<p class="st-convs__none" role="alert">${acts.note}</p>` : null}
    ${menu ? html`<${Menu} label=${T.menu.label} x=${menu.x} y=${menu.y} items=${convMenuItems(menu.row, app)}
      onSelect=${id => { const r = menu.row; const b = menu.back; setMenu(null); b?.focus?.(); void acts.run(id, r) }}
      onClose=${({ restoreFocus }) => { const b = menu.back; setMenu(null); if (restoreFocus) b?.focus?.() }} />` : null}
    ${acts.dialog}
  </nav>`
}
