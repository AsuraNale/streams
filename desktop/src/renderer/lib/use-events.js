// Small hooks around the bridge's events (lib/bridge.js onEvent) for the screens of plan A.
//   useEvent(topic, handler, deps)   subscribe while mounted; the newest handler is the one called. A topic the preload
//                                    does not know yet (the main process still being built) is a warning, not a crash.
//   useInboxCount(enabled)           how many items wait in 待看: getHome().numbers.inbox once, then every inbox-changed
//                                    payload's `count` (the sidebar badge). Null while unknown or while no library is open.
import { useEffect, useRef, useState } from './html.js'
import { call, onEvent } from './bridge.js'

export function useEvent(topic, handler, deps = []) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    try {
      return onEvent(topic, payload => latest.current(payload))
    } catch (err) {
      console.warn(`onEvent(${topic}): ${err?.message ?? err}`)
      return undefined
    }
  }, deps)
}

export function useInboxCount(enabled) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    if (!enabled) { setCount(null); return undefined }
    let live = true
    call('getHome').then(home => { if (live) setCount(typeof home?.numbers?.inbox === 'number' ? home.numbers.inbox : null) }, () => {})
    return () => { live = false }
  }, [enabled])
  useEvent('inbox-changed', payload => { if (enabled && typeof payload?.count === 'number') setCount(payload.count) }, [enabled])
  return count
}
