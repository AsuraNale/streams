// Small hooks around the bridge's events (lib/bridge.js onEvent) for the screens of plan A.
//   useEvent(topic, handler, deps)   subscribe while mounted; the newest handler is the one called. A topic the preload
//                                    does not know yet (the main process still being built) is a warning, not a crash.
//   useInboxCount(enabled, libraryId) how many items wait in 待看: getHome().numbers.inbox once (again when the current
//                                    library changes), then every inbox-changed payload's `count` of that library (the sidebar
//                                    badge; v2 package A: another library's event is not this one's count). Null while unknown
//                                    or while no library is open.
//   isOfLibrary(payload, libraryId)  an event of the main process is about this library (or names none; while the
//                                    current library is not known yet, every event is taken, as in v1.0)
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

export function isOfLibrary(payload, libraryId) {
  const id = payload !== null && typeof payload === 'object' ? payload.libraryId : undefined
  return libraryId === null || libraryId === undefined || id === undefined || id === null || id === libraryId
}

export function useInboxCount(enabled, libraryId = null) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    if (!enabled) { setCount(null); return undefined }
    let live = true
    call('getHome').then(home => { if (live) setCount(typeof home?.numbers?.inbox === 'number' ? home.numbers.inbox : null) }, () => {})
    return () => { live = false }
  }, [enabled, libraryId])
  useEvent('inbox-changed', payload => { if (enabled && typeof payload?.count === 'number' && isOfLibrary(payload, libraryId)) setCount(payload.count) }, [enabled, libraryId])
  return count
}
