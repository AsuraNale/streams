// Every screen the app can show, by id. navigate(id) only goes to ids listed here.
// Adding a screen: docs/desktop.md §五 (one file in screens/, one line here, its words in texts/,
// its styles in styles/screens/ + one @import in styles/app.css).
//
// Today (11-02) the eight entries of the sidebar are placeholders (screens/placeholder.js); each becomes its own
// file as its day comes (plan 5.2). The component gallery ('kit') is not here: app.js adds it in development only.
import { placeholderScreen } from './placeholder.js'
import { SettingsScreen } from './settings.js'

export const SCREENS = Object.freeze({
  today: placeholderScreen('today'),
  inbox: placeholderScreen('inbox'),
  library: placeholderScreen('library'),
  graph: placeholderScreen('graph'),
  ask: placeholderScreen('ask'),
  pipeline: placeholderScreen('pipeline'),
  sources: placeholderScreen('sources'),
  status: placeholderScreen('status'),
  settings: SettingsScreen,
})

/** The screen the app opens on. */
export const FIRST_SCREEN = 'today'
