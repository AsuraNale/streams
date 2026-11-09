// The page's entry: one App, which holds the route and the app's state, and shows the current screen.
// A screen gets `params` (from navigate) and reaches the rest through useApp() (lib/app-context.js).
// The app state is read again whenever the main process says a setting changed (event `settings-changed`), the
// library changed (`library-changed`) or the connections did (`connections-changed`).
// v2 package I (contract I1; docs/desktop.md §五「首次打开」): when the app state first arrives and the app knows no library at all
// (`libraryCount` 0 — not v1.0's 「no library open」), the app shows 首次打开 (screens/first-run.js: the connection) in place of
// the sidebar's entries; its end takes the app to 和主 Agent 聊 (the second step: its guide shows while there is no library).
// With libraries registered and none current (a removed current library, say) the app opens on 库架 instead. It is decided once:
// removing every library later does not bring 首次打开 back (库架 then says there is none). 新建库 (`newLibrary()`: the sidebar,
// the shelf, the chat's guide) is the route 'new-library' (screens/new-library.js, v1.0's steps without the connection).
//
// v2 package F (plan B; docs/desktop.md §五「界面结构」): the sidebar does not change with the library — 库架 ('shelf'),
// 和主 Agent 聊 ('chat'), one line per library, 「新建库」, 设置. A library's page is five tabs, each a route of LIBRARY_ROUTES
// (kit/library-sections.js): overview · inbox · library (and its graph view, 'graph') · ask · sources; they all work on the
// current library (package A's 「当前库」). v1.0's ids still lead somewhere (ALIASES: 今日 and 运行状态 are 概览 now, 流水线 is
// the 关卡 part of 来源与要求). Each library remembers, in memory, the route you were on and how far its page was scrolled
// (`memory`): a click on a library (openLibrary) makes it the current one (setActiveLibrary) and goes back to that route,
// or to its 待看 the first time.
import { html, render, useEffect, useRef, useState } from './lib/html.js'
import { AppContext } from './lib/app-context.js'
import { call } from './lib/bridge.js'
import { useEvent } from './lib/use-events.js'
import { useLoad } from './lib/use-load.js'
import { useLibraries, useWaiting } from './lib/libraries.js'
import { ALIASES, FIRST_SCREEN, LIBRARY_FIRST_SCREEN, SCREENS } from './screens/index.js'
import { FirstRunScreen } from './screens/first-run.js'
import { LIBRARY_ROUTES } from './kit/index.js'
import { BRAND } from './texts/common.js'

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
  // 首次打开: decided once, when the app state first arrives — the app knows no library at all; its end goes to 和主 Agent 聊
  const [setup, setSetup] = useState(null)
  useEffect(() => {
    if (setup !== null) return
    if (appState.data) {
      const none = appState.data.libraryCount === 0 && route.screen !== 'kit'
      // libraries registered, none of them current: 库架 (unless development opened another screen first)
      if (!none && appState.data.library === null && !location.hash) setRoute({ screen: 'shelf', params: {} })
      setSetup(none)
    } else if (appState.status === 'error') setSetup(false) // the state could not be read: the screens say so themselves
  }, [appState.data, appState.status])
  // the theme (docs/desktop.md §五「主题」): the first frame already has it (the main process serves index.html with
  // data-theme); a change in 设置 sets it at once, and the app state keeps <html> in step after that
  useEffect(() => {
    const theme = appState.data?.theme
    if (typeof theme === 'string' && document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme
  }, [appState.data?.theme])
  useEvent('settings-changed', () => appState.reload())
  useEvent('library-changed', () => appState.reload())
  useEvent('connections-changed', () => appState.reload())
  const shell = setup === false
  const libraries = useLibraries(shell)
  const waiting = useWaiting(shell)
  const libraryId = appState.data?.library?.libraryId ?? null
  // the route of a library's page is that library's to remember
  useEffect(() => {
    if (libraryId && LIBRARY_ROUTES.includes(route.screen)) memory.current.routes.set(libraryId, route)
  }, [route, libraryId])

  const navigate = (screen, params = {}) => {
    const next = routeOf(screen, params)
    if (!next) {
      console.warn(`navigate: no screen "${screen}" yet`)
      return
    }
    setRoute(next)
  }
  /** A library of the sidebar or the shelf: the current one from now on, then its page where you left it (else 待看). */
  const openLibrary = async id => {
    const back = () => setRoute(memory.current.routes.get(id) ?? { screen: LIBRARY_FIRST_SCREEN, params: {} })
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
    route, navigate, has, appState, libraries, waiting, openLibrary, memory: memory.current,
    // 新建库, the manual way (v2 package I): its own route; 「取消」 comes back to the screen it was opened from
    newLibrary: () => setRoute(r => (r.screen === 'new-library' ? r : { screen: 'new-library', params: { back: r.screen } })),
  }
  if (setup === null) return null
  if (setup === true) {
    return html`<${AppContext.Provider} value=${value}>
      <${FirstRunScreen} onDone=${screen => { setSetup(false); appState.reload(); navigate(screen ?? 'chat') }} />
    <//>`
  }
  const Screen = screens[route.screen]
  // a library's page starts afresh for another library (nothing of the one before stays on it)
  const key = LIBRARY_ROUTES.includes(route.screen) ? `${libraryId ?? 'none'}:${route.screen}` : route.screen
  return html`<${AppContext.Provider} value=${value}>
    <${Screen} key=${key} params=${route.params} />
  <//>`
}

render(html`<${App} />`, document.getElementById('root'))
