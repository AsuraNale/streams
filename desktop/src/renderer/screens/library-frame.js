// A library's page (v2 package F, plan B; design P3–P7): the sidebar, then one card — the library's head (its mark, its name,
// 「在追：…」, the screen's actions on the right), the five tabs (kit/library-sections.js LibrarySections layout="tabs"; 待看's
// badge is that library's count), and the screen itself (Main: data-screen / data-state, as every screen). v2 package L: the
// window's right panel (screens/right-panel.js, four tabs) is the frame's third column; what a screen had as its own right
// column is its 「详情」 now (`detail`). Every tab's screen draws itself inside this frame:
//   html`<${LibraryFrame} tab="inbox" state=${state} labelledby="inbox-title" actions=${…} detail=${…}>
//     <${TopBar} title=… titleTag="h2" … />  <div class="st-main__body …">…</div>
//   <//>`
// `screen` (default `tab`) is the Main's data-screen: 资料库's graph view is tab 'library', screen 'graph'.
// The head's words come from the libraries the app context holds (lib/libraries.js: listLibraries + getLibrariesOverview).
// What the frame remembers per library (app.js `memory`): how far the screen's body (.st-main__body) was scrolled — put back
// once the screen has its data. `section` (a route's params.section, e.g. 流水线 → 来源与要求's 关卡): the part
// [data-part=<section>] is scrolled into view once the screen has its data, instead.
// Test hooks: .lib-page[data-library=<id>], [data-part="library-head"] with h1#lib-head-name and [data-part="tracking"],
// nav.st-lib-tabs button[data-tab=<id>][aria-current] with [data-tab-badge].
import { html, useEffect, useRef } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { fmt } from '../lib/format.js'
import { tracking } from '../lib/libraries.js'
import { AppFrame, AppSidebar, LibraryMark, LibrarySections, Main } from '../kit/index.js'
import { SHELL } from '../texts/shell.js'
import { SEP } from '../texts/common.js'
import { RightPanel } from './right-panel.js'

export function LibraryHead({ row, name, actions }) {
  const what = row ? tracking(row, SEP) : null
  return html`<header class="lib-head" data-part="library-head">
    <${LibraryMark} icon=${row?.icon ?? (name ? [...name][0] : '')} color=${row?.color} size="m" />
    <div class="lib-head__text">
      <h1 class="lib-head__name" id="lib-head-name">${row?.name ?? name ?? ''}</h1>
      <div class="lib-head__tracking st-t-small st-t-sub" data-part="tracking">${what ? fmt(SHELL.head.tracking, { what }) : SHELL.head.trackingNone}</div>
    </div>
    ${actions ? html`<div class="lib-head__actions">${actions}</div>` : null}
  </header>`
}

export function LibraryFrame({ tab, screen = tab, state, label, labelledby, actions, detail = null, section, children }) {
  const { appState, libraries, navigate, memory } = useApp()
  const current = appState?.data?.library ?? null
  const id = current?.libraryId ?? null
  const row = (libraries?.data ?? []).find(r => r.id === id) ?? null
  const content = useRef(null)
  const placed = useRef(false)
  const placing = useRef(false)
  const scrollKey = `${id ?? ''}:${screen}`
  // once the screen has its data: back to where it was scrolled (or to the part a route names). The parts of a screen that
  // load on their own (来源与要求's 要求 and 关卡) can still grow after that: tried again every 100 ms until the place is
  // reached and nothing in the body says data-state="loading" (3 s at most); the scrolling this causes is not remembered
  useEffect(() => {
    if (placed.current || state !== 'ready' || !content.current) return undefined
    placed.current = true
    const body = content.current.querySelector('.st-main__body')
    const top = memory?.scroll?.get(scrollKey)
    if (!body || (!section && typeof top !== 'number')) return undefined
    const target = () => {
      if (!section) return top
      const part = body.querySelector(`[data-part="${section}"]`)
      return part ? part.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop : null
    }
    let tries = 0
    let timer = null
    placing.current = true
    const put = () => {
      timer = null
      if (!body.isConnected) { placing.current = false; return }
      const want = target()
      if (want !== null) body.scrollTop = want
      const there = want !== null && Math.abs(body.scrollTop - want) <= 1 && !body.querySelector('[data-state="loading"]')
      if (there || ++tries >= 30) { placing.current = false; memory?.scroll?.set(scrollKey, body.scrollTop); return }
      timer = setTimeout(put, 100)
    }
    put()
    return () => { if (timer) clearTimeout(timer); placing.current = false }
  }, [state])
  const remember = e => {
    const t = e.target
    if (memory && !placing.current && t?.classList?.contains('st-main__body')) memory.scroll.set(scrollKey, t.scrollTop)
  }
  // v2 package L: the right panel beside the page (its 详情 is this screen's `detail`); the page itself has two parts no more
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current=${screen} />`} panel=${html`<${RightPanel} detail=${detail} />`}>
    <div class="lib-page" data-library=${id ?? ''}>
      <${LibraryHead} row=${row} name=${current?.name ?? null} actions=${actions} />
      <${LibrarySections} layout="tabs" current=${tab} badges=${{ inbox: row?.inbox ?? null }} onSelect=${t => navigate(t)} />
      <div class="lib-page__content" ref=${content} onScrollCapture=${remember}>
        <${Main} screen=${screen} state=${state} label=${label} labelledby=${labelledby}>${children}<//>
      </div>
    </div>
  <//>`
}

/** 资料库's two views (list · graph): two buttons, the current one pressed. */
export function ViewSwitch({ current, onSelect }) {
  return html`<div class="lib-mode" role="group" aria-label=${SHELL.view.label}>
    ${['list', 'graph'].map(v => html`<button type="button" key=${v} class="lib-mode__button" data-mode=${v} aria-pressed=${String(current === v)} onClick=${() => onSelect(v)}>${SHELL.view[v]}</button>`)}
  </div>`
}
