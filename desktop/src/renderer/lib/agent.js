// The main Agent's things as the page reads them (v2 package G; docs/desktop.md §4.5, §4.6, §4.20, §五「主 Agent」):
//   useProposals()             every 主 Agent 提议 (listProposals(null), newest first), read again on `proposals-changed`:
//                              { status, data, byId: Map, pending: [card…], reload, put(card) } — put(card) shows a card the
//                              bridge just gave back (确认 · 拒绝 · 提出修改) at once, until the read that follows
//   useToConfirm(enabled)      redesign R5b (P16, O5): the one list of 待确认 — every library's 主 Agent 提议 waiting and 系统检测
//                              not handled (the bridge's listToConfirm, R5a) — { status, items, handled, count, byId, reload,
//                              drop(id) }. `count` is the list's length: the right panel's tab and the 主 Agent page's head both
//                              say it. Read again, without a reload of the page, on the events that change it: a proposal
//                              (`proposals-changed`), a 系统检测 made, handled or expired (`suggestions-changed`: after a run, a
//                              放弃 written — rule ⑤ —, a change of a library's settings), a turn of the main Agent ended
//                              (`agent-changed` done), the libraries' list (`libraries-changed`). drop(id) takes one off at once
//                              (what the user just did), until that read; say(text) keeps one line of what became of a
//                              proposal that left it otherwise (失效 · 未能执行), shown on top of the list.
//   useAgentBusy()             is a turn of the main Agent running now (getAgentStatus().busy, then `agent-changed`):
//                              { busy, status, reload }
import { useState } from './html.js'
import { call } from './bridge.js'
import { useEvent } from './use-events.js'
import { useLoad } from './use-load.js'

export function useProposals() {
  const list = useLoad(() => call('listProposals', null), [])
  useEvent('proposals-changed', () => list.reload())
  const cards = Array.isArray(list.data) ? list.data : []
  return {
    ...list,
    byId: new Map(cards.map(c => [c.id, c])),
    pending: cards.filter(c => c.status === 'pending'),
    put: card => { if (card && typeof card.id === 'string') list.mutate(all => all.map(c => (c.id === card.id ? card : c))) },
  }
}

const EMPTY = Object.freeze({ items: [], handled: [], count: 0 })

export function useToConfirm(enabled) {
  const list = useLoad(async () => {
    if (!enabled) return EMPTY
    const v = await call('listToConfirm')
    return { items: Array.isArray(v?.items) ? v.items : [], handled: Array.isArray(v?.handled) ? v.handled : [] }
  }, [enabled])
  const [said, setSaid] = useState(null)
  const again = () => { if (enabled) list.reload() }
  useEvent('proposals-changed', again, [enabled])
  useEvent('suggestions-changed', again, [enabled])
  useEvent('agent-changed', p => { if (p?.phase === 'done') again() }, [enabled])
  useEvent('libraries-changed', again, [enabled])
  const items = list.data?.items ?? []
  return {
    status: list.status,
    items,
    handled: list.data?.handled ?? [],
    count: items.length,
    byId: new Map(items.map(i => [i.id, i])),
    reload: list.reload,
    drop: id => list.mutate(d => ({ ...d, items: d.items.filter(i => i.id !== id) })),
    // what became of one that left the list without being confirmed or declined (screens/proposal.js), until the next one
    said,
    say: text => setSaid(typeof text === 'string' && text ? text : null),
  }
}

export function useAgentBusy() {
  const status = useLoad(() => call('getAgentStatus'), [])
  const [live, setLive] = useState(null)
  useEvent('agent-changed', p => {
    if (p?.phase === 'started') setLive(true)
    else if (p?.phase === 'done') { setLive(false); status.reload() }
  })
  const busy = live ?? (status.data?.busy === true)
  return { busy, status: status.data, reload: status.reload }
}
