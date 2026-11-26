// 1.1.3 (菜单五; 赞妮's plan 9.6): a library's menu — the shelf's card 「更多」 (1.1.1 P11a) and a right click on a library of the
// sidebar: 与主 Agent 对话 · 立即运行 · 在资源管理器中显示 · 关闭定时 / 开启定时 · 移除该库.
//   libraryMenuItems(row, place)  row: a library of lib/libraries.js (its schedule); place: its place in the run queue
//                                 (lib/queue.js queueStateOf) — 立即运行 greyed while it runs or waits; 定时 hidden without one
//   useLibraryMenu()              { open(row, x, y, back), host }: host draws the menu and, for 移除该库, the dialog of 来源与要求
//                                 (screens/sources.js RemoveLibraryDialog, loaded when asked: the kit never loads a screen
//                                 before) — with 「与主 Agent 进行中的修改将被放弃。」 when the library's conversation has something
//                                 open, which is stopped and discarded before the library is removed
// Test hooks: the menu's [data-menu-item=talk|run-now|reveal|schedule-off|schedule-on|remove]; [data-part=library-menu-failed].
import { html, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { queueStateOf } from '../lib/queue.js'
import { Menu } from './menu.js'
import { SHELL } from '../texts/shell.js'

export function libraryMenuItems(row, place = null) {
  const M = SHELL.shelf.more
  const on = row.schedule?.enabled === true
  return [
    { id: 'talk', label: M.talk },
    { id: 'run-now', label: M.runNow, disabled: place?.state === 'running' || place?.state === 'queued' },
    { id: 'reveal', label: M.reveal },
    ...(row.schedule ? [{ id: on ? 'schedule-off' : 'schedule-on', label: on ? M.scheduleOff : M.scheduleOn }] : []),
    { id: 'remove', label: M.remove, danger: true },
  ]
}

export function useLibraryMenu() {
  const app = useApp()
  const [menu, setMenu] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [failed, setFailed] = useState(false)
  const M = SHELL.shelf.more
  const pick = async (id, row) => {
    setFailed(false)
    try {
      if (id === 'talk') app.openConversation(`lib:${row.id}`)
      else if (id === 'run-now') await call('runLibrary', row.id)
      else if (id === 'reveal') await call('revealLibraryOf', row.id)
      else if (id === 'schedule-off' || id === 'schedule-on') { await call('setLibrarySchedule', row.id, { ...row.schedule, enabled: id === 'schedule-on' }); app.libraries?.reload?.() }
      else if (id === 'remove') {
        const { RemoveLibraryDialog } = await import('../screens/sources.js')
        const open = (app.conversations?.data?.libraries ?? []).find(r => r.id === `lib:${row.id}`)?.open === true
        setRemoving({ row, Dialog: RemoveLibraryDialog, open })
      }
    } catch { setFailed(true) }
  }
  const host = html`${menu ? html`<${Menu} label=${M.label} x=${menu.x} y=${menu.y} items=${libraryMenuItems(menu.row, queueStateOf(app.queue?.data ?? null, menu.row.id))}
      onSelect=${id => { const { row, back } = menu; setMenu(null); back?.focus?.(); void pick(id, row) }}
      onClose=${({ restoreFocus }) => { const b = menu.back; setMenu(null); if (restoreFocus) b?.focus?.() }} />` : null}
    ${removing ? html`<${removing.Dialog} id=${removing.row.id} name=${removing.row.name} path=${removing.row.path ?? ''} openChange=${removing.open}
      onClose=${() => setRemoving(null)} onDone=${() => { setRemoving(null); app.libraries?.reload?.(); app.appState?.reload?.(); app.conversations?.reload?.() }} />` : null}
    ${failed ? html`<p class="progress-alert st-library-menu-failed" role="alert" data-part="library-menu-failed">${M.failed}</p>` : null}`
  return { open: (row, x, y, back = null) => setMenu({ row, x, y, back }), host, failed }
}
