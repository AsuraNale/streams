// Load data once (and again on `reload()`): { status: 'loading' | 'ready' | 'error', data, error, reload, mutate }.
// A reload keeps the last data on screen while the new one loads. `mutate(fn)` changes the data on screen at once (fn gets the
// data, gives the new): for what the user has just done (an entry renamed or taken out of a list), until the read that
// follows it brings the same from the source.
import { useEffect, useState } from './html.js'

export function useLoad(load, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    setState(s => ({ ...s, status: 'loading' }))
    Promise.resolve()
      .then(load)
      .then(
        data => { if (live) setState({ status: 'ready', data, error: null }) },
        error => { if (live) setState(s => ({ status: 'error', data: s.data, error })) },
      )
    return () => { live = false }
  }, [...deps, round])
  return { ...state, reload: () => setRound(r => r + 1), mutate: fn => setState(s => (s.data === null ? s : { ...s, data: fn(s.data) })) }
}
