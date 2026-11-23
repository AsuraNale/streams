/**
 * Redesign R5a (O9; docs/desktop.md §4.19): what the bridge hands the page of a source's last fetch and a run's problems — a
 * state (the five fetch states) or a code, and the key of what to do; never the raw error text or an HTTP code. The raw text
 * goes to raw-errors.mjs (the log, 「复制诊断信息」) as the data passes through here.
 * Pure: no Electron, plain Node tests (test/services-r5a.test.mjs).
 * @module desktop/main/public-data
 */

const noted = (raw, where, what) => { try { raw?.note(where, what) } catch { /* the log is best effort */ } }

/**
 * A source's row (core sourcesView: its last fetch) as the page may see it: the state, the hint, how many times in
 * a row — not the fetcher's message or the HTTP code.
 */
export function publicSourceRow(s, { raw = null, where = 'source' } = {}) {
  if (!s || typeof s !== 'object') return s ?? null
  if (s.status && s.status !== 'ok' && (s.message || (s.http !== undefined && s.http !== null))) noted(raw, `${where} ${s.name ?? ''}`, { message: s.message, http: s.http, code: s.status })
  const { message: _m, http: _h, ...rest } = s
  return rest
}

/** A run's problems: the code and the connection's code, where it stopped — not the detail. */
export function publicProblems(list, { raw = null, where = 'run' } = {}) {
  if (!Array.isArray(list)) return list ?? null
  return list.map((p) => {
    if (!p || typeof p !== 'object') return p
    noted(raw, `${where} problem ${p.code ?? '?'}`, { message: p.detail, code: p.connectionCode })
    return { code: p.code ?? null, ...(p.connectionCode ? { connectionCode: p.connectionCode } : {}), ...(p.node ? { node: p.node } : {}) }
  })
}

/** A run's result (core runUpdate) as the page may see it: its problems without their details. */
export function publicResult(r, { raw = null, where = 'run' } = {}) {
  if (!r || typeof r !== 'object') return r ?? null
  return Array.isArray(r.problems) ? { ...r, problems: publicProblems(r.problems, { raw, where }) } : r
}
