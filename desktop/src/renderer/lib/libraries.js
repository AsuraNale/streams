// The libraries the app knows, for the sidebar, the shelf and a library's head (v2 package F): one list, read with
// listLibraries (the registry's rows, which one is current) and getLibrariesOverview (待看, the last round, the problem, the
// brief, the topics, the sources), joined by id.
//   useLibraries(enabled)  → { status, data: [row…] | null, error, reload }; a row is
//       { id, name, icon, color, active, exists, temporary, inbox, lastRoundAt, problem, brief, topics, sources, noOutputStreak }
//     read again on `libraries-changed` (the registry), `library-changed` (a library's contents: its brief, its sources) and
//     the end of a round (`round-progress` with done: true: its last round, its problem — v2 package J1);
//     on `inbox-changed { libraryId, count }` only that one row's `inbox` changes (another library's event is not this one's
//     count; an event without a libraryId: the whole list read again).
//   useWaiting(enabled)    → how many things wait for you in 和主 Agent 聊: the pending proposal cards (listProposals) plus the
//     suggestion cards not handled — 0 until the bridge has a `listSuggestions` (package C / G); read again on
//     `proposals-changed`, when a turn of the main Agent ends (`agent-changed` done: 「交给主 Agent」 ran one) and when a
//     suggestion card was handled on the page (package G: lib/agent.js suggestionsChanged).
//   useWaitingItems(enabled) → v2 package L: the same read, the things themselves — { count, cards: [card…], suggestions: [s…],
//     reload }: the right panel's 「等你决定」 lists them and the sidebar's badge is their `count` (one source, one number)
//   tracking(row)          → what the library follows, for 「在追：…」: the brief's first sentence, else its topics' names; null
//   firstSentence(text)    → the text up to its first full stop (。！？.!? or a line end), trimmed
import { call } from './bridge.js'
import { useEvent } from './use-events.js'
import { useLoad } from './use-load.js'
import { SUGGESTIONS_EVENT, usePageEvent } from './agent.js'

const SENTENCE_END = /[。！？!?\n]|\.(?=\s|$)/

export function firstSentence(text) {
  if (typeof text !== 'string') return ''
  const t = text.trim()
  const m = SENTENCE_END.exec(t)
  return (m ? t.slice(0, m.index + (m[0] === '\n' ? 0 : 1)) : t).trim()
}

/** 「在追：…」: the brief's first sentence, else the topics' names joined; null when there is neither. */
export function tracking(row, sep = ' · ') {
  const brief = firstSentence(row?.brief ?? '')
  if (brief) return brief
  const topics = Array.isArray(row?.topics) ? row.topics.filter(t => typeof t === 'string' && t !== '') : []
  return topics.length ? topics.join(sep) : null
}

/** The registry's rows joined with the overview's lines (by id; a row the overview does not have keeps zeros). */
export function joinRows(list, overview) {
  const byId = new Map((Array.isArray(overview) ? overview : []).map(o => [o.id, o]))
  return (Array.isArray(list) ? list : []).map(l => {
    const o = byId.get(l.id) ?? {}
    return {
      id: l.id, name: l.name, icon: l.icon, color: l.color, active: l.active === true, exists: l.exists !== false, temporary: l.temporary === true,
      inbox: typeof o.inbox === 'number' ? o.inbox : 0, lastRoundAt: o.lastRoundAt ?? null, problem: o.problem ?? null, brief: o.brief ?? null,
      topics: Array.isArray(o.topics) ? o.topics : [], sources: typeof o.sources === 'number' ? o.sources : 0, noOutputStreak: o.noOutputStreak ?? 0,
    }
  })
}

/** One row's 待看 count from an inbox-changed payload: only the row whose id the payload names. */
export function withInboxCount(rows, payload) {
  if (!Array.isArray(rows)) return rows
  return rows.map(r => (r.id === payload.libraryId ? { ...r, inbox: payload.count } : r))
}

export function useLibraries(enabled) {
  const rows = useLoad(() => (enabled ? Promise.all([call('listLibraries'), call('getLibrariesOverview')]).then(([l, o]) => joinRows(l, o)) : null), [enabled])
  useEvent('libraries-changed', () => { if (enabled) rows.reload() }, [enabled])
  useEvent('library-changed', () => { if (enabled) rows.reload() }, [enabled])
  // a round ended (any library's): its last round and its problem changed — the shelf's 「上次更新」, the amber dot
  useEvent('round-progress', p => { if (enabled && p?.done === true) rows.reload() }, [enabled])
  useEvent('inbox-changed', p => {
    if (!enabled || typeof p?.count !== 'number') return
    if (typeof p.libraryId !== 'string' || p.libraryId === '') { rows.reload(); return }
    rows.mutate(list => withInboxCount(list, p))
  }, [enabled])
  return rows
}

/** The suggestion cards not handled yet, through the bridge's listSuggestions once it exists (package C / G); else none. */
async function openSuggestions() {
  const api = globalThis.streams
  if (!api || typeof api.listSuggestions !== 'function') return []
  try {
    const list = await call('listSuggestions', null)
    return Array.isArray(list) ? list.filter(s => s && (s.status === undefined || s.status === 'open')) : []
  } catch { return [] }
}

/** v2 package L: the proposal cards waiting and the suggestion cards not handled, every library's — what the badge counts. */
export function useWaitingItems(enabled) {
  // (a reload keeps the last list on screen until the new one comes: lib/use-load.js)
  const items = useLoad(async () => {
    if (!enabled) return { cards: [], suggestions: [] }
    const [cards, suggestions] = await Promise.all([call('listProposals', { status: 'pending' }).catch(() => []), openSuggestions()])
    return { cards: Array.isArray(cards) ? cards : [], suggestions }
  }, [enabled])
  useEvent('proposals-changed', () => { if (enabled) items.reload() }, [enabled])
  useEvent('agent-changed', p => { if (enabled && p?.phase === 'done') items.reload() }, [enabled])
  usePageEvent(SUGGESTIONS_EVENT, () => { if (enabled) items.reload() }, [enabled])
  const cards = items.data?.cards ?? []
  const suggestions = items.data?.suggestions ?? []
  return { count: cards.length + suggestions.length, cards, suggestions, reload: items.reload }
}

/** How many things wait for you (the sidebar's badge): useWaitingItems' count. */
export function useWaiting(enabled) {
  return useWaitingItems(enabled).count
}
