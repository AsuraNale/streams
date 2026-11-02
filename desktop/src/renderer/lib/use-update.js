// The update's data (docs/desktop.md §十九): read once from the main process (bridge getUpdateState) and then whatever it sends
// on the `update` event — a check, the download's progress, the setup program starting, a turn starting or ending. Each
// snapshot carries `seq`, which only grows: the newest one is kept whether it came as an event or as a call's answer (a quick
// download's last event can arrive before the answer that started it).
//   const update = useUpdate()     { data: <getUpdateState data> | null, check, download, cancel, install, openPage }
import { useEffect, useRef, useState } from './html.js'
import { call, onEvent } from './bridge.js'

const newer = (have, got) => (got && typeof got === 'object' && typeof got.state === 'string' && (!have || !(got.seq < have.seq)) ? got : have)

export function useUpdate() {
  const [data, setData] = useState(null)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    const off = onEvent('update', payload => { if (live.current) setData(have => newer(have, payload)) })
    call('getUpdateState').then(d => { if (live.current) setData(have => newer(have, d)) }, () => {})
    return () => { live.current = false; off() }
  }, [])
  const take = name => call(name).then(d => { if (live.current) setData(have => newer(have, d)); return d })
  return {
    data,
    check: () => take('checkForUpdate'),
    download: () => take('downloadUpdate'),
    cancel: () => take('cancelUpdateDownload'),
    // { ok } or { ok: false, reason }: the state itself comes as an event
    install: () => call('installUpdate'),
    openPage: () => call('openReleasePage'),
  }
}
