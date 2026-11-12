// D21 「关于」: the version, 「检查更新」, and what the update says (work order 08; docs/desktop.md §四; no draft draws it). Data:
// lib/use-update.js (getUpdateState + the `update` event); words: texts/settings.js SETTINGS.update. The notes come as plain
// text from the main process and are shown as text (never as HTML). Hooks for the tests: [data-update] (the state),
// [data-update-action="…"] around each button, [data-update-link] on the links, [data-update-notes], [data-update-progress].
import { html, useEffect, useState } from '../lib/html.js'
import { fmt, pageLocale, whenText } from '../lib/format.js'
import { useUpdate } from '../lib/use-update.js'
import { SETTINGS } from '../texts/settings.js'
import { WHEN } from '../texts/common.js'

const T = SETTINGS.update
const NOTE_LINES = 4

const mb = bytes => (Number.isFinite(bytes) && bytes >= 0 ? `${(bytes / 1048576).toFixed(1)} MB` : '—')

function dateText(iso) {
  const d = new Date(iso)
  if (typeof iso !== 'string' || Number.isNaN(d.getTime())) return null
  try { return d.toLocaleDateString(pageLocale(), { year: 'numeric', month: 'long', day: 'numeric' }) } catch { return d.toISOString().slice(0, 10) }
}

/** A button with a hook for the tests around it. Redesign R4b: the template's .btn (设置 is on the template's parts). */
const Action = ({ name, variant, disabled, onClick, children }) => html`<span class="st-act" data-update-action=${name}><button type="button" class=${variant === 'primary' ? 'btn primary' : 'btn'} disabled=${disabled} onClick=${onClick}>${children}</button></span>`

function PageLink({ text, onOpen }) {
  return html`<a href="#" class="settings__link settings__update-link" data-update-link onClick=${e => { e.preventDefault(); onOpen() }}>${text}</a>`
}

function Notes({ notes }) {
  const lines = String(notes ?? '').split('\n').filter(l => l.trim() !== '')
  if (!lines.length) return null
  return html`<div class="settings__update-notes" data-update-notes>${lines.slice(0, NOTE_LINES).map((l, i) => html`<div key=${i}>${l}</div>`)}</div>`
}

/** What the update says now, under the version line. */
function Status({ u, deferred, setDeferred, busy, act }) {
  const d = u.data
  const r = d.release
  const open = () => u.openPage().catch(() => {})
  switch (d.state) {
    case 'checking':
      return html`<div role="status" class="st-t-small st-t-muted" data-update="checking">${T.checking}</div>`
    case 'up_to_date': {
      const recent = d.checkedAt && Date.now() - Date.parse(d.checkedAt) < 60_000
      return html`<div role="status" class="st-t-small st-t-sub" data-update="up_to_date">${recent || !d.checkedAt ? T.upToDate : fmt(T.upToDateAt, { at: whenText(d.checkedAt, WHEN) })}</div>`
    }
    case 'available':
      return html`<div class="settings__update-box" data-update="available">
        <div class="settings__update-title">${fmt(T.available, { version: r?.version ?? '' })}</div>
        ${r?.publishedAt ? html`<div class="st-t-small st-t-sub">${fmt(T.released, { date: dateText(r.publishedAt) })}</div>` : null}
        <${Notes} notes=${r?.notes} />
        <div><${PageLink} text=${T.fullNotes} onOpen=${open} /></div>
        ${d.canUpdate
          ? html`<div class="settings__row">
              <${Action} name="download" variant="primary" disabled=${busy} onClick=${() => act(u.download)}>${T.download}<//>
              ${r?.size ? html`<span class="st-t-small st-t-muted">${fmt(T.size, { size: mb(r.size) })}</span>` : null}
            </div>`
          : html`<div class="st-t-small st-t-sub" data-update-dev>${T.devCannot}</div>`}
      </div>`
    case 'manual':
      return html`<div class="settings__update-box" data-update="manual">
        <div>${r?.version ? fmt(T.manual, { version: r.version }) : T.manualUnknown}</div>
        <div><${PageLink} text=${T.openPage} onOpen=${open} /></div>
      </div>`
    case 'check_failed': {
      const text = ['http_403', 'http_429'].includes(d.reason) ? T.checkTooOften : ['timeout', 'network', 'no_source'].includes(d.reason) ? T.checkFailed : T.checkOdd
      return html`<div class="settings__update-line" data-update="check_failed">
        <span class="settings__error">${text}</span>
        <${Action} name="retry-check" disabled=${busy} onClick=${() => act(u.check)}>${T.retry}<//>
      </div>`
    }
    case 'downloading': {
      const got = d.progress?.received ?? 0
      const total = d.progress?.total ?? r?.size ?? 0
      const pct = total > 0 ? Math.min(100, Math.floor((got / total) * 100)) : 0
      return html`<div class="settings__update-box" data-update="downloading">
        <div class="settings__update-title">${fmt(T.available, { version: r?.version ?? '' })}</div>
        <div class="settings__update-bar" role="progressbar" aria-label=${T.progressLabel} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct} data-update-progress=${pct}>
          <span class="settings__update-fill" style=${{ width: `${pct}%` }}></span>
        </div>
        <div class="settings__row">
          <span class="st-t-small st-t-sub">${fmt(T.downloading, { got: mb(got), total: mb(total) })}</span>
          <${Action} name="cancel" onClick=${() => act(u.cancel)}>${T.cancel}<//>
        </div>
      </div>`
    }
    case 'download_failed':
    case 'verify_failed':
      return html`<div class="settings__update-box" data-update=${d.state}>
        <div class="settings__error">${d.state === 'verify_failed' ? T.verifyFailed : T.downloadFailed}</div>
        <div class="settings__row">
          <${Action} name="redownload" disabled=${busy} onClick=${() => act(u.download)}>${T.redownload}<//>
          <${PageLink} text=${T.openPage} onOpen=${open} />
        </div>
      </div>`
    case 'ready':
      if (deferred) {
        return html`<div class="settings__update-line" data-update="ready" data-update-deferred>
          <span class="st-t-small st-t-sub">${fmt(T.deferred, { version: r?.version ?? '' })}</span>
          <${Action} name="now" onClick=${() => setDeferred(false)}>${T.now}<//>
        </div>`
      }
      return html`<div class="settings__update-box settings__update-box--ready" data-update="ready">
        <div class="settings__update-title">${fmt(T.readyTitle, { version: r?.version ?? '' })}</div>
        <div>${T.readyText}</div>
        ${d.turnRunning ? html`<div class="settings__update-wait" role="status" data-update-turn>${T.turnRunning}</div>` : null}
        <div class="settings__row">
          <${Action} name="start" variant="primary" disabled=${busy || d.turnRunning} onClick=${() => act(u.install)}>${T.start}<//>
          <${Action} name="later" onClick=${() => setDeferred(true)}>${T.later}<//>
        </div>
      </div>`
    case 'launching':
      return html`<div role="status" class="st-t-small st-t-sub" data-update="launching">${T.launching}</div>`
    case 'launch_failed':
      return html`<div class="settings__update-box" data-update="launch_failed">
        <div class="settings__error">${T.launchFailed}</div>
        <div class="settings__row">
          <${Action} name="retry-start" disabled=${busy || d.turnRunning} onClick=${() => act(u.install)}>${T.retry}<//>
          <${PageLink} text=${T.openPage} onOpen=${open} />
        </div>
      </div>`
    default:
      return null
  }
}

/** The 「关于」 part's content: 「流息 0.2.1（Windows 版）」 (「开发版」 in a development run) + 「检查更新」, then the update's state. */
export function AboutUpdate({ version, devBuild }) {
  const u = useUpdate()
  const [deferred, setDeferred] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const state = u.data?.state ?? 'idle'
  // 「刚刚检查」 turns into the time after a minute
  useEffect(() => {
    if (state !== 'up_to_date') return undefined
    const t = setInterval(() => tick(n => n + 1), 20_000)
    return () => clearInterval(t)
  }, [state])
  useEffect(() => { if (state !== 'ready') setDeferred(false) }, [state])
  const act = async fn => {
    setBusy(true)
    try { await fn() } catch { /* the state says what happened */ } finally { setBusy(false) }
  }
  const checking = state === 'checking'
  const canCheck = !['checking', 'downloading', 'ready', 'launching'].includes(state)
  return html`<div class="settings__about" data-update-root>
    <div class="settings__row">
      <span data-version=${version}>${fmt(devBuild ? SETTINGS.versionDev : SETTINGS.version, { version })}</span>
      <${Action} name="check" disabled=${busy || checking || !canCheck || !u.data} onClick=${() => act(u.check)}>${T.check}<//>
    </div>
    ${u.data ? html`<${Status} u=${u} deferred=${deferred} setDeferred=${setDeferred} busy=${busy} act=${act} />` : null}
  </div>`
}
