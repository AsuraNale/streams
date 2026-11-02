// What every screen can reach: the current route, navigate(), has(screen) (is that screen registered) and the app's state
// (loaded once by App, read again on settings-changed).
//   const { route, navigate, has, appState } = useApp()
//   appState = useLoad result: { status, data: <getAppState data>, error, reload }
import { createContext, useContext } from './html.js'

export const AppContext = createContext(null)

export function useApp() {
  return useContext(AppContext)
}
