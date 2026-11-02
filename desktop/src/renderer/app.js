// The page's entry: one App, which holds the route and the app's state, and shows the current screen.
// A screen gets `params` (from navigate) and reaches the rest through useApp() (lib/app-context.js).
// The app state is read again whenever the main process says a setting changed (event `settings-changed`).
import { html, render, useEffect, useState } from './lib/html.js'
import { AppContext } from './lib/app-context.js'
import { call, onEvent } from './lib/bridge.js'
import { useLoad } from './lib/use-load.js'
import { FIRST_SCREEN, SCREENS } from './screens/index.js'
import { BRAND } from './texts/common.js'

// the page's language and title come from the brand table (docs/desktop.md…­): in English the main process serves
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
  useEffect(() => onEvent('settings-changed', () => appState.reload()), [])
  const navigate = (screen, params = {}) => {
    if (!Object.hasOwn(screens, screen)) {
      console.warn(`navigate: no screen "${screen}" yet`)
      return
    }
    setRoute({ screen, params })
  }
  // a click on a notification of the app (the main process brought the window to the front): the screen it names
  useEffect(() => onEvent('open-screen', p => { if (typeof p?.screen === 'string') navigate(p.screen) }), [])
  const Screen = screens[route.screen]
  const has = id => Object.hasOwn(screens, id)
  return html`<${AppContext.Provider} value=${{ route, navigate, has, appState }}>
    <${Screen} params=${route.params} />
  <//>`
}

render(html`<${App} />`, document.getElementById('root'))
