/**
 * Redesign R5a (O9, docs/desktop.md §4.19): the raw error texts the page never gets. What the bridge hands the page says a
 * state (the five fetch states) or a kind of failure and the key of what to do; the fetcher's own message, an HTTP code, a
 * failed step's exception text, a run problem's detail go here instead — one line in the app's log each, and the newest
 * RAW_ERRORS_MAX of them in memory for 「复制诊断信息」 (设置 → 关于 → 高级; diagnostics.mjs). Nothing is written anywhere else.
 * Secrets are taken out of the whole diagnostics text when it is made (diagnostics.mjs), so a key that slipped into a message
 * never leaves.
 * @module desktop/main/raw-errors
 */

export const RAW_ERRORS_MAX = 50
const TEXT_MAX = 600

/**
 * @param {{log?: (line: string) => void, now?: () => Date, max?: number}} [o]
 * @returns {{note: (where: string, raw: {message?: unknown, http?: unknown, code?: unknown, detail?: unknown}) => void, lines: () => string[], size: () => number}}
 */
export function createRawErrors({ log = () => {}, now = () => new Date(), max = RAW_ERRORS_MAX } = {}) {
  const ring = [] // [{ key, line }]
  const text = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX)
  return {
    /**
     * One raw error: where it came from (e.g. 'trySource feed-a'), and what the code had of it. Empty ones are skipped; the
     * same one again (a card listed twice) is kept once.
     */
    note(where, raw = {}) {
      const parts = []
      if (raw.code !== undefined && raw.code !== null && raw.code !== '') parts.push(`code ${text(raw.code)}`)
      if (raw.http !== undefined && raw.http !== null && raw.http !== '') parts.push(`HTTP ${text(raw.http)}`)
      const message = text(raw.message ?? raw.detail)
      if (message) parts.push(message)
      if (parts.length === 0) return
      const key = `${text(where)}: ${parts.join(' · ')}`
      if (ring.some(r => r.key === key)) return
      const line = `${now().toISOString()} ${key}`
      ring.push({ key, line })
      while (ring.length > max) ring.shift()
      log(`raw error: ${line}`)
    },
    lines: () => ring.map(r => r.line),
    size: () => ring.length,
  }
}
