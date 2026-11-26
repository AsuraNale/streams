// 1.1 W6b: the build conversation as the page knows it (services/build.mjs). 1.1.3 (维护者 11-26; 赞妮's plan): many
// conversations — one per library, the new libraries' apart — shared by 主 Agent's page (screens/build.js, its column:
// screens/conversations.js), the right panel's 待确认 (screens/right-panel.js) and the sidebar's 主 Agent.
//   useConversations(enabled)   { status, data, reload }: listConversations once, again on each `build-changed` (not its
//                               progress) and `libraries-changed`; data { unbuilt, libraries, latest, cards, attention,
//                               organised } or null
//   useFresh()                  「有新内容」 (plan 3.4: in the page only, never on disk): { has(conv), seen(conv), open(conv) }
//                               — a conversation whose turn ended (build-changed done) while it was not the one open
//   useDrafts()                 what was typed and not sent, by conversation (kept while the app runs): { get, set, add }
//                               — add(conv, text) puts words brought from elsewhere after what is there, on a new line
//   confirmAndOpen(app, conv)   确认: the library made (or its card changed), then that library's 来源与要求 (its card on top)
import { useEffect, useRef, useState } from './html.js'
import { call } from './bridge.js'
import { useEvent } from './use-events.js'

export function useConversations(enabled) {
  const [state, setState] = useState({ status: 'loading', data: null })
  const load = async () => {
    if (!enabled) { setState({ status: 'ready', data: null }); return }
    try { setState({ status: 'ready', data: (await call('listConversations')) ?? null }) } catch { setState(s => ({ ...s, status: 'error' })) }
  }
  useEffect(() => { void load() }, [enabled])
  useEvent('build-changed', p => { if (p?.phase !== 'progress') void load() }, [enabled])
  useEvent('libraries-changed', () => { void load() }, [enabled])
  // a library's card or step changed elsewhere: a change of it may not be confirmable any more (plan 第八节)
  useEvent('library-changed', () => { void load() }, [enabled])
  return { ...state, reload: load }
}

export function useFresh() {
  const [fresh, setFresh] = useState(() => new Set())
  const openNow = useRef(null)
  useEvent('build-changed', p => {
    if (p?.phase === 'done' && typeof p.conv === 'string' && p.conv !== openNow.current) setFresh(s => (s.has(p.conv) ? s : new Set(s).add(p.conv)))
  }, [])
  const seen = conv => setFresh(s => { if (!s.has(conv)) return s; const n = new Set(s); n.delete(conv); return n })
  return {
    has: conv => fresh.has(conv),
    seen,
    // the conversation shown now (null: none): its replies are seen as they come
    open: conv => { openNow.current = conv ?? null; if (conv) seen(conv) },
  }
}

export function useDrafts() {
  const box = useRef(new Map())
  return {
    get: conv => box.current.get(conv) ?? '',
    set: (conv, text) => { if (text) box.current.set(conv, text); else box.current.delete(conv) },
    add: (conv, text) => {
      const t = String(text ?? '')
      if (!t) return
      const was = box.current.get(conv) ?? ''
      box.current.set(conv, was.trim() ? `${was.replace(/\s+$/, '')}\n${t}` : t)
    },
  }
}

export async function confirmAndOpen(app, conv) {
  const r = await call('confirmBuild', conv)
  app?.conversations?.reload?.()
  app?.libraries?.reload?.()
  if (r?.libraryId) await app?.openLibrary?.(r.libraryId, { screen: 'sources', params: {} })
  return r
}
