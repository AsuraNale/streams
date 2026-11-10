// v2 package M (docs/desktop.md §4.11): the corner above 设置 — the current connection's plan windows or API balance in words.
//   quotaView(q, now)  → { kind: 'plan' | 'balance', title, rows: [{ id, text }], asOf } or null (nothing to show: the corner
//                        is not drawn at all — no connection, nothing read, no balance endpoint, a shape not known)
//   useQuota()         → that view for the page, read with getQuota at mount and again on quota-changed / connections-changed
// Every word comes from texts/shell.js SHELL.sidebar.quota (texts-en in English); no brand name is ever shown.
import { useEffect, useState } from './html.js'
import { call } from './bridge.js'
import { useEvent } from './use-events.js'
import { fmt, nextText, whenText } from './format.js'
import { SHELL } from '../texts/shell.js'
import { WHEN } from '../texts/common.js'

const T = SHELL.sidebar.quota
// Claude Code's two windows by their id; Codex's by their length
const SPAN_MINS = Object.freeze({ five_hour: 300, seven_day: 10080 })

function span(mins) {
  if (!(mins > 0)) return null
  if (mins % 1440 === 0) return fmt(T.days, { n: mins / 1440 })
  if (mins % 60 === 0) return fmt(T.hours, { n: mins / 60 })
  return fmt(T.minutes, { n: mins })
}

const pct = v => String(Math.round(v * 10) / 10)

export function quotaView(q, now = new Date()) {
  if (!q || typeof q !== 'object') return null
  const asOf = whenText(q.at, WHEN, now)
  if (q.source === 'api') {
    const rows = (Array.isArray(q.balance) ? q.balance : [])
      .filter(b => b && typeof b.currency === 'string' && Number.isFinite(b.amount))
      .map(b => ({ id: b.currency, text: fmt(T.amount, { amount: b.amount.toFixed(2), currency: b.currency }) }))
    return rows.length ? { kind: 'balance', title: T.balance, rows, asOf } : null
  }
  if (q.source !== 'claude-code' && q.source !== 'codex') return null
  const rows = []
  for (const w of Array.isArray(q.windows) ? q.windows : []) {
    const s = span(q.source === 'codex' ? w?.windowMins : SPAN_MINS[w?.id])
    const when = Number.isInteger(w?.resetsAt) ? nextText(new Date(w.resetsAt * 1000).toISOString(), T.resets, now) : null
    if (!s || !when || !Number.isFinite(w.usedPercent)) continue
    rows.push({ id: w.id, text: fmt(T.window, { span: s, pct: pct(w.usedPercent), when }) })
  }
  return rows.length ? { kind: 'plan', title: T.plan, rows, asOf } : null
}

export function useQuota() {
  const [quota, setQuota] = useState(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    call('getQuota').then(q => { if (live) setQuota(q ?? null) }, () => { if (live) setQuota(null) })
    return () => { live = false }
  }, [round])
  const again = () => setRound(r => r + 1)
  useEvent('quota-changed', again)
  useEvent('connections-changed', again)
  return quotaView(quota)
}
