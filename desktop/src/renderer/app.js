// The page's entry: one App, which holds the route and the app's state, and shows the current screen.
// A screen gets `params` (from navigate) and reaches the rest through useApp() (lib/app-context.js).
// The app state is read again whenever the main process says a setting changed (event `settings-changed`), the
// library changed (`library-changed`) or the connections did (`connections-changed`).
// v2 package I (contract I1; docs/desktop.md §五「首次打开」): when the app state first arrives and the app knows no library at all
// (`libraryCount` 0 — not v1.0's 「no library open」), the app opens on 首次打开 (screens/first-run.js). Redesign R4a: it is the
// route 'first-run' in the usual frame (one screen: the connection on top, what to track, 发送 → 主 Agent with the sentence,
// 手动创建 → 新建库, 暂不创建 → 库架; docs/desktop.md §4.16; 1.1: 新建库 and 主 Agent are the build conversation, 'build').
// With libraries registered and none current (a removed current library, say) the app opens on 库架 instead. It is decided once:
// removing every library later does not bring 首次打开 back (库架 then says there is none). 新建库 (`newLibrary()`: the sidebar,
// the shelf) is the route 'build' (screens/build.js).
//
// v2 package F (plan B; docs/desktop.md §五「界面结构」): the sidebar does not change with the library — 库架 ('shelf'),
// 主 Agent (the build conversation; 'chat' is its alias), one line per library, 「新建库」, 设置. A library's page is four tabs, each a route of LIBRARY_ROUTES
// (kit/library-sections.js): inbox · library (and its graph view, 'graph') · ask · sources (redesign R1: 概览 gone); all on the
// current library (package A's 「当前库」). v1.0's ids still lead somewhere (ALIASES: 今日 and 运行状态 open 待看). Each library remembers, in memory, the route you were on and how far its page was scrolled
// (`memory`): a click on a library (openLibrary) makes it the current one (setActiveLibrary) and goes back to that route,
// or to its 待看 the first time.
import { html, render, useEffect, useRef, useState } from './lib/html.js'
import { AppContext } from './lib/app-context.js'
import { call } from './lib/bridge.js'
import { useEvent } from './lib/use-events.js'
import { useLoad } from './lib/use-load.js'
import { useLibraries } from './lib/libraries.js'
import { useConversations, useDrafts, useFresh } from './lib/build.js'
// v2 package L: the one queue of the rounds (the right panel, the sidebar, 库架, the library's head)
import { useQueue } from './lib/queue.js'
import { ALIASES, FIRST_SCREEN, LIBRARY_FIRST_SCREEN, SCREENS } from './screens/index.js'
import { LIBRARY_ROUTES } from './kit/index.js'
import { BRAND } from './texts/common.js'
import { applyLook } from './lib/theme.js'

// the page's language and title come from the brand table (docs/desktop.md §六): in English the main process serves
// texts-en/common.js for this import, so <html lang> and the window title follow the words; index.html stays Chinese
document.documentElement.lang = BRAND.htmlLang
document.title = BRAND.name

const screens = { ...SCREENS }
// The component gallery exists in development only: the main process opens it (`npm start -- --screen kit`) and
// only a development run serves its files (src/main/protocol.mjs DEV_ONLY), so a packaged app cannot load it.
if (location.hash === '#kit') {
  try { screens.kit = (await import('./screens/kit.js')).KitScreen } catch { /* not served: no gallery */ }
}

/** A screen id (or one of v1.0's, ALIASES) → the route it is: { screen, params }, or null when there is no such screen. */
function routeOf(id, params = {}) {
  if (Object.hasOwn(ALIASES, id)) {
    const [screen, extra] = ALIASES[id]
    return { screen, params: { ...extra, ...params } }
  }
  return Object.hasOwn(screens, id) ? { screen: id, params } : null
}

// the main process may open another screen first in development (`npm start -- --screen <id>`)
const first = () => routeOf(decodeURIComponent(location.hash.slice(1))) ?? { screen: FIRST_SCREEN, params: {} }

function App() {
  const appState = useLoad(() => call('getAppState'), [])
  const [route, setRoute] = useState(first)
  // per library (its registry id): the last route of its page, and how far each of its screens was scrolled
  const memory = useRef({ routes: new Map(), scroll: new Map() })
  // 首次打开: decided once, when the app state first arrives — the app knows no library at all → the route 'first-run' (redesign
  // R4a: a screen of the usual frame, the sidebar and the right panel there; its ways out are routes too)
  const [setup, setSetup] = useState(null)
  useEffect(() => {
    if (setup !== null) return
    if (appState.data) {
      const none = appState.data.libraryCount === 0
      // no library at all: 首次打开 (unless development opened another screen first)
      if (none && !location.hash) setRoute({ screen: 'first-run', params: {} })
      // libraries registered, none of them current: 库架 (unless development opened another screen first)
      else if (!none && appState.data.library === null && !location.hash) setRoute({ screen: 'shelf', params: {} })
      setSetup(false)
    } else if (appState.status === 'error') setSetup(false) // the state could not be read: the screens say so themselves
  }, [appState.data, appState.status])
  // the look (docs/desktop.md §五「主题」; redesign R1): the first frame already has it (the main process serves index.html with
  // the theme's template sheets and <body> class); a change in 设置 — or Windows turning dark under 跟随系统 (settings-changed,
  // below: the state comes back with the new scheme) — swaps the sheets and the classes (lib/theme.js)
  // Redesign R6d: the icons are each theme's own (lib/template-icons.js draws from the theme in force on the page), and the
  // page has the new theme only once its sheets have loaded — after the render that the change of state caused. So when the
  // look is on the page the app draws once more: before, a theme chosen in 设置 kept the icons of the theme before it until
  // something else made the page draw (found by scripts/shots-r6d.mjs: the light pictures had the wrong theme's icons).
  const [, setLookDrawn] = useState(0)
  useEffect(() => {
    const theme = appState.data?.theme
    const scheme = appState.data?.scheme
    if (typeof theme === 'string' && (scheme === 'light' || scheme === 'dark')) applyLook({ theme, scheme }).then(() => setLookDrawn(n => n + 1))
  }, [appState.data?.theme, appState.data?.scheme])
  useEvent('settings-changed', () => appState.reload())
  useEvent('library-changed', () => appState.reload())
  useEvent('connections-changed', () => appState.reload())
  const shell = setup === false
  const libraries = useLibraries(shell)
  // v2 package L: the queue
  const queue = useQueue(shell)
  // 1.1 W6b: the build conversation (新建库, 主 Agent and the right panel's 待确认: its card is what waits for you to confirm);
  // read in 首次打开 too, where it starts. 1.1.3: the conversations, one per library and the new libraries' apart (lib/build.js);
  // 「有新内容」 and what was typed and not sent, by conversation, in the page only
  const conversations = useConversations(true)
  const fresh = useFresh()
  const drafts = useDrafts()
  const libraryId = appState.data?.library?.libraryId ?? null
  // the route of a library's page is that library's to remember
  useEffect(() => {
    if (libraryId && LIBRARY_ROUTES.includes(route.screen)) memory.current.routes.set(libraryId, route)
  }, [route, libraryId])

  /** v2 package L: the right panel — { open?, tab? } at once on the page, then written (setPanel) for the next start. */
  const setPanel = async patch => {
    appState.mutate(d => ({ ...d, panel: { ...(d.panel ?? {}), ...patch } }))
    try {
      const panel = await call('setPanel', patch)
      appState.mutate(d => ({ ...d, panel }))
    } catch (err) { console.warn(`setPanel: ${err?.code ?? err}`) }
  }

  const navigate = (screen, params = {}) => {
    const next = routeOf(screen, params)
    if (!next) {
      console.warn(`navigate: no screen "${screen}" yet`)
      return
    }
    setRoute(next)
  }
  /**
   * A library of the sidebar or the shelf: the current one from now on, then its page where you left it (else 待看). v2 package
   * L: `to` — a route of its page to go to instead ({ screen, params }).
   */
  const openLibrary = async (id, to = null) => {
    const back = () => setRoute(to ?? memory.current.routes.get(id) ?? { screen: LIBRARY_FIRST_SCREEN, params: {} })
    if (id === libraryId) { back(); return true }
    try {
      const lib = await call('setActiveLibrary', id)
      appState.mutate(d => ({ ...d, library: lib }))
      back()
      return true
    } catch (err) {
      console.warn(`setActiveLibrary(${id}): ${err?.code ?? err}`)
      libraries.reload()
      return false
    }
  }
  // a click on a notification of the app (the main process brought the window to the front): the screen it names
  useEvent('open-screen', p => { if (typeof p?.screen === 'string') navigate(p.screen) })
  const has = id => routeOf(id) !== null
  const value = {
    route, navigate, has, appState, libraries, openLibrary, memory: memory.current,
    // v2 package L: the right panel's lists, the queue; setPanel folds / unfolds the panel or picks a tab (settings.json)
    queue, setPanel, conversations, fresh, drafts,
    // 1.1 W6b: 新建库 is the build conversation ('build'); 「取消」 comes back to the screen it was opened from. 1.1.3 (plan 第五节):
    // always the 新建库 page, whatever conversation is on 主 Agent's page now
    newLibrary: () => setRoute(r => ({ screen: 'build', params: { back: r.screen === 'build' ? (r.params?.back ?? null) : r.screen } })),
    // 1.1.3: a conversation of the main agent (screens/build.js); opener: words brought into its box, after what is there
    openConversation: (conv, { opener = null, card = false } = {}) => {
      if (typeof opener === 'string' && opener) drafts.add(conv, opener)
      setRoute({ screen: 'build', params: { conv, ...(card ? { card: true } : {}) } })
    },
    // 1.1 W13: 「打开已有的库」 (lib/open-existing.js) — the folder dialog; a library → registered once, current, its 待看;
    // 'cancelled' · 'not-library' (nothing registered, nothing written) · 'opened'; an error of addLibrary goes up
    openExisting: async () => {
      const chosen = await call('chooseLibraryFolder')
      if (!chosen) return 'cancelled'
      if (chosen.state !== 'library') return 'not-library'
      const lib = await call('addLibrary', chosen.path)
      appState.mutate(d => ({ ...d, library: lib, libraryCount: Math.max(1, d?.libraryCount ?? 0) }))
      libraries.reload()
      setRoute({ screen: LIBRARY_FIRST_SCREEN, params: {} })
      return 'opened'
    },
  }
  if (setup === null) return null
  const Screen = screens[route.screen]
  // a library's page starts afresh for another library (nothing of the one before stays on it)
  const key = LIBRARY_ROUTES.includes(route.screen) ? `${libraryId ?? 'none'}:${route.screen}` : route.screen
  return html`<${AppContext.Provider} value=${value}>
    <${Screen} key=${key} params=${route.params} />
  <//>`
}

render(html`<${App} />`, document.getElementById('root'))
