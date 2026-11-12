// The main Agent's things as the page reads them (v2 package G; docs/desktop.md §4.5, §4.6, §五「和主 Agent 聊」):
//   useProposals()             every proposal card (listProposals(null), newest first), read again on `proposals-changed`:
//                              { status, data, byId: Map, pending: [card…], reload, put(card) } — put(card) shows a card the
//                              bridge just gave back (confirm / no / change it) at once, until the read that follows
//   useSuggestions(libraryId)  the suggestion cards not handled (listSuggestions; one library's when an id is given, else
//                              every library's), read again when a turn of the main Agent ends (`agent-changed` done) and when
//                              a card was handled on this page (suggestionsChanged)
//   suggestionsChanged()       say so to every part of the page that counts suggestion cards (the sidebar's badge too):
//                              a DOM event of the page itself, not a topic of the main process
//   useAgentBusy()             is a turn of the main Agent running now (getAgentStatus().busy, then `agent-changed`):
//                              { busy, status, reload }
import { useEffect, useState } from './html.js'
import { call } from './bridge.js'
import { useEvent } from './use-events.js'
import { useLoad } from './use-load.js'

export const SUGGESTIONS_EVENT = 'streams-suggestions-changed'

export function suggestionsChanged() {
  try { globalThis.dispatchEvent?.(new Event(SUGGESTIONS_EVENT)) } catch { /* no window: nothing listens */ }
}

/** Listen to one of the page's own DOM events while mounted. */
export function usePageEvent(name, handler, deps = []) {
  useEffect(() => {
    const fn = () => handler()
    globalThis.addEventListener?.(name, fn)
    return () => globalThis.removeEventListener?.(name, fn)
  }, deps)
}

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

export function useSuggestions(libraryId = null) {
  const list = useLoad(() => call('listSuggestions', libraryId ? { libraryId } : null), [libraryId])
  useEvent('agent-changed', p => { if (p?.phase === 'done') list.reload() }, [libraryId])
  // redesign R1: the cards a round records (services/agent.mjs afterRound, before the round's end reaches the page) show in the
  // right panel's 待确认 without leaving the page (概览 read them again each time it was opened)
  useEvent('round-progress', p => { if (p?.done === true) list.reload() }, [libraryId])
  usePageEvent(SUGGESTIONS_EVENT, () => list.reload(), [libraryId])
  return { ...list, items: Array.isArray(list.data) ? list.data : [] }
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
