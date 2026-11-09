// 库架 (v2 package F; design P1): one card per library — its mark, its name, what it follows (lib/libraries.js tracking: the
// brief's first sentence, else its topics), when it was last updated and how many sources it has, its 待看 count in large
// figures, one line on what is wrong (the folder gone · a source with a problem · N rounds in a row without output) or that its
// sources are fine — and last a card 「+ 新建库 · 和主 Agent 聊着建」 (→ 和主 Agent 聊). A click on a card is a click on that
// library in the sidebar (openLibrary). No library: one line and two buttons (和主 Agent 聊 / 手动新建). The data is the app
// context's libraries (listLibraries + getLibrariesOverview); words: texts/shell.js SHELL.shelf.
// Test hooks: main[data-screen="shelf"][data-state], [data-shelf-card=<id>] with [data-part=name|tracking|updated|inbox|problem]
// ([data-problem=<problem>|"none"]), [data-action=new-card|new-library|empty-chat|empty-manual], [data-part="shelf-empty"].
import { html } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { fmt, whenText } from '../lib/format.js'
import { tracking } from '../lib/libraries.js'
import { Act } from '../lib/action.js'
import { AppFrame, AppSidebar, Icon, LibraryMark, LinkButton, Main, TopBar } from '../kit/index.js'
import { ERRORS, SEP, WHEN } from '../texts/common.js'
import { SHELL } from '../texts/shell.js'

const T = SHELL.shelf

function problemLine(row) {
  if (row.problem === 'missing') return T.problems.missing
  if (row.problem === 'sources') return T.problems.sources
  if (row.problem === 'no-output') return fmt(T.problems['no-output'], { n: row.noOutputStreak ?? 0 })
  return null
}

function Card({ row, onOpen }) {
  const what = tracking(row, SEP)
  const problem = problemLine(row)
  const updated = row.lastRoundAt ? fmt(T.updated, { when: whenText(row.lastRoundAt, WHEN) ?? row.lastRoundAt }) : T.updatedNever
  return html`<button type="button" class="shelf-card" data-shelf-card=${row.id} data-active=${String(row.active)} onClick=${onOpen}>
    <${LibraryMark} icon=${row.icon} color=${row.color} size="l" />
    <span class="shelf-card__text">
      <span class="shelf-card__name st-t-strong" data-part="name">${row.name}</span>
      <span class="shelf-card__tracking st-t-small st-t-sub" data-part="tracking">${what ? fmt(SHELL.head.tracking, { what }) : SHELL.head.trackingNone}</span>
      <span class="st-t-small st-t-sub" data-part="updated">${updated}${SEP}${fmt(T.sources, { n: row.sources ?? 0 })}</span>
      <span class=${`shelf-card__problem st-t-small ${problem ? 'st-t-wait' : 'st-t-done'}`} data-part="problem" data-problem=${row.problem ?? 'none'}>
        ${problem ? html`<span class="shelf-card__dot" aria-hidden="true"></span>` : null}${problem ?? T.fine}
      </span>
    </span>
    <span class="shelf-card__inbox" data-part="inbox" data-value=${row.inbox ?? 0}>
      <span class="shelf-card__count st-t-num">${row.inbox ?? 0}</span>
      <span class="st-t-tiny st-t-sub">${T.inboxLabel}</span>
    </span>
  </button>`
}

export function ShelfScreen() {
  const { libraries, openLibrary, navigate, newLibrary } = useApp()
  const rows = Array.isArray(libraries?.data) ? libraries.data : null
  const state = rows ? 'ready' : libraries?.status ?? 'loading'
  const actions = html`<${Act} name="new-library" icon="plus" onClick=${() => newLibrary()}>${T.newButton}<//>`
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="shelf" />`}>
    <${Main} screen="shelf" state=${state} labelledby="shelf-title">
      <${TopBar} title=${T.title} subtitle=${rows ? fmt(T.subtitle, { n: rows.length }) : null} titleTag="h1" titleId="shelf-title" actions=${actions} />
      <div class="st-main__body shelf-body">
        ${libraries?.status === 'error' && !rows ? html`<div class="shelf-error" role="alert">${T.loadFailed}<${LinkButton} onClick=${() => libraries.reload()}>${ERRORS.retry}<//></div>` : null}
        ${rows && rows.length === 0 ? html`<div class="shelf-empty" data-part="shelf-empty">
          <p class="st-t-sub">${T.emptyText}</p>
          <div class="shelf-empty__actions">
            <${Act} name="empty-chat" variant="primary" icon="chat" onClick=${() => navigate('chat')}>${T.emptyChat}<//>
            <${Act} name="empty-manual" icon="plus" onClick=${() => newLibrary()}>${T.emptyManual}<//>
          </div>
        </div>` : null}
        ${rows && rows.length ? html`<div class="shelf-grid">
          ${rows.map(r => html`<${Card} key=${r.id} row=${r} onOpen=${() => openLibrary(r.id)} />`)}
          <button type="button" class="shelf-card shelf-card--new" data-action="new-card" onClick=${() => navigate('chat')}>
            <${Icon} name="plus" /><span>${T.newCard}</span>
          </button>
        </div>` : null}
      </div>
    <//>
  <//>`
}
