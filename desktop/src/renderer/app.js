// The page's entry: one App, which holds the route and the app's state, and shows the current screen.
// A screen gets `params` (from navigate) and reaches the rest through useApp() (lib/app-context.js).
// The app state is read again whenever the main process says a setting changed (event `settings-changed`) or the
// library changed (`library-changed`). While no library is open the app shows 首次设置 (screens/first-run.js) in place
// of the sidebar's entries, until the wizard says it is done (docs/desktop.md §4.1「首次设置」).
import { html, render, useEffect, useState } from './lib/html.js'
import { AppContext } from './lib/app-context.js'
import { call } from './lib/bridge.js'
import { useEvent, useInboxCount } from './lib/use-events.js'
import { useLoad } from './lib/use-load.js'
import { FIRST_SCREEN, SCREENS } from './screens/index.js'
import { FirstRunScreen } from './screens/first-run.js'
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

// the main process may open another screen first in development (`npm start -- --screen <id>`)
const first = () => {
  const id = decodeURIComponent(location.hash.slice(1))
  return Object.hasOwn(screens, id) ? id : FIRST_SCREEN
}

function App() {
  const appState = useLoad(() => call('getAppState'), [])
  const [route, setRoute] = useState({ screen: first(), params: {} })
  // first-time setup: decided once, when the app state first arrives without a library; the wizard ends it
  const [setup, setSetup] = useState(null)
  useEffect(() => {
    if (setup !== null) return
    if (appState.data) setSetup(appState.data.library === null && route.screen !== 'kit')
    else if (appState.status === 'error') setSetup(false) // the state could not be read: the screens say so themselves
  }, [appState.data, appState.status])
  // the theme (docs/desktop.md §五「主题」): the first frame already has it (the main process serves index.html with
  // data-theme); a change in 设置 sets it at once, and the app state keeps <html> in step after that
  useEffect(() => {
    const theme = appState.data?.theme
    if (typeof theme === 'string' && document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme
  }, [appState.data?.theme])
  useEvent('settings-changed', () => appState.reload())
  useEvent('library-changed', () => appState.reload())
  const inboxCount = useInboxCount(Boolean(appState.data?.library) && setup !== true)
  const navigate = (screen, params = {}) => {
    if (!Object.hasOwn(screens, screen)) {
      console.warn(`navigate: no screen "${screen}" yet`)
      return
    }
    setRoute({ screen, params })
  }
  // a click on a notification of the app (the main process brought the window to the front): the screen it names
  useEvent('open-screen', p => { if (typeof p?.screen === 'string') navigate(p.screen) })
  const has = id => Object.hasOwn(screens, id)
  const value = { route, navigate, has, appState, inboxCount }
  if (setup === null) return null
  if (setup === true) {
    return html`<${AppContext.Provider} value=${value}>
      <${FirstRunScreen} onDone=${screen => { setSetup(false); appState.reload(); navigate(screen ?? 'today') }} />
    <//>`
  }
  const Screen = screens[route.screen]
  return html`<${AppContext.Provider} value=${value}>
    <${Screen} params=${route.params} />
  <//>`
}

render(html`<${App} />`, document.getElementById('root'))
