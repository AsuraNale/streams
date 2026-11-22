// 1.1 W6b: the build conversation as the page knows it (services/build.mjs getBuild), shared by 新建库 (screens/build.js) and
// the right panel's 待确认 (screens/right-panel.js).
//   useBuild(enabled)      { status, data, reload, set }: getBuild once, again on each `build-changed`; data null when no
//                          conversation is going
//   waitingCard(view)      the agent's last card while it can be confirmed (its turn), else null
//   confirmAndOpen(app)    确认: the library made (or its card changed), then that library's 来源与要求 (its card on top)
import { useEffect, useState } from './html.js'
import { call } from './bridge.js'
import { useEvent } from './use-events.js'

export function useBuild(enabled) {
  const [state, setState] = useState({ status: 'loading', data: null })
  const load = async () => {
    if (!enabled) { setState({ status: 'ready', data: null }); return }
    try { setState({ status: 'ready', data: (await call('getBuild')) ?? null }) } catch { setState(s => ({ ...s, status: 'error' })) }
  }
  useEffect(() => { void load() }, [enabled])
  useEvent('build-changed', () => { void load() }, [enabled])
  return { ...state, reload: load, set: data => setState({ status: 'ready', data: data ?? null }) }
}

export function waitingCard(view) {
  if (!view || view.status !== 'talking') return null
  const last = [...(view.turns ?? [])].reverse().find(t => t.role === 'agent' && t.kind === 'card')
  return last && last.canConfirm === true ? last : null
}

export async function confirmAndOpen(app) {
  const r = await call('confirmBuild')
  app?.build?.set?.(null)
  app?.libraries?.reload?.()
  if (r?.libraryId) await app?.openLibrary?.(r.libraryId, { screen: 'sources', params: {} })
  return r
}
