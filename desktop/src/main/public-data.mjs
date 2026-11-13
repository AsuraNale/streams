/**
 * Redesign R5a (O9; docs/desktop.md §4.19): what the bridge hands the page of a proposal's failure, a source's try, a run's
 * problems — a state (the five fetch states) or a kind of failure, and the key of what to do; never the raw error text or an
 * HTTP code. The raw text goes to raw-errors.mjs (the log, 「复制诊断信息」) as the data passes through here.
 * Pure: no Electron, plain Node tests (test/services-r5a.test.mjs).
 * @module desktop/main/public-data
 */

import { CORE_BAD_ARGUMENT_CODES } from './bridge-methods.mjs'

/** What to do about a failed proposal (a key of texts/proposals.js PROPOSALS.advice). */
export const FAILURE_ADVICE = Object.freeze({ refused: 'failureRefused', error: 'failureError' })

const noted = (raw, where, what) => { try { raw?.note(where, what) } catch { /* the log is best effort */ } }

/** A source's try (core fetchSource / trialOf) as the page may see it: the state, the hint, the count, a sample. */
export function publicTrial(t, { raw = null, where = 'trial' } = {}) {
  if (!t || typeof t !== 'object') return t ?? null
  if ((t.message && t.status !== 'ok') || (t.http !== undefined && t.http !== null && t.status !== 'ok')) noted(raw, where, { message: t.message, http: t.http, code: t.status })
  const { message: _m, http: _h, ...rest } = t
  return rest
}

/**
 * A source's row (core sourcesView / statusView: its last fetch) as the page may see it: the state, the hint, how many times in
 * a row — not the fetcher's message or the HTTP code.
 */
export function publicSourceRow(s, { raw = null, where = 'source' } = {}) {
  if (!s || typeof s !== 'object') return s ?? null
  if (s.status && s.status !== 'ok' && (s.message || (s.http !== undefined && s.http !== null))) noted(raw, `${where} ${s.name ?? ''}`, { message: s.message, http: s.http, code: s.status })
  const { message: _m, http: _h, ...rest } = s
  return rest
}

/** A failed step of a confirmed proposal: the step, whether it was undone, a category and its advice key — not the text. */
export function publicFailure(f, { raw = null, where = 'proposal' } = {}) {
  if (!f || typeof f !== 'object') return f ?? null
  // already made public (a card listed, then shown again): as it is — its category cannot be worked out a second time
  if (typeof f.category === 'string' && f.message === undefined) return f
  noted(raw, where, { message: f.message, code: f.code })
  const category = typeof f.code === 'string' && (CORE_BAD_ARGUMENT_CODES.includes(f.code) || f.code.startsWith('duplicate-')) ? 'refused' : 'error'
  return {
    step: f.step ?? null, done: Array.isArray(f.done) ? f.done : [], rolledBack: f.rolledBack === true,
    ...(Array.isArray(f.left) ? { left: f.left } : {}), category, advice: FAILURE_ADVICE[category],
  }
}

/** A proposal card as the page may see it (its trials and its failure without their raw texts). */
export function publicCard(c, { raw = null } = {}) {
  if (!c || typeof c !== 'object') return c
  const out = { ...c }
  if (Array.isArray(c.trial)) out.trial = c.trial.map((t) => publicTrial(t, { raw, where: `proposal ${c.id} trial ${t?.name ?? ''}` }))
  else if (c.trial && typeof c.trial === 'object') out.trial = publicTrial(c.trial, { raw, where: `proposal ${c.id} trial` })
  if (c.failure) out.failure = publicFailure(c.failure, { raw, where: `proposal ${c.id} ${c.kind} failed at ${c.failure.step ?? '?'}` })
  if (typeof c.result?.changesNotRecorded === 'string') {
    noted(raw, `proposal ${c.id} changes not recorded`, { message: c.result.changesNotRecorded })
    out.result = { ...c.result, changesNotRecorded: true }
  }
  return out
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

/** A run's result (core runRound / rescoreRejected) as the page may see it: its problems without their details. */
export function publicResult(r, { raw = null, where = 'run' } = {}) {
  if (!r || typeof r !== 'object') return r ?? null
  return Array.isArray(r.problems) ? { ...r, problems: publicProblems(r.problems, { raw, where }) } : r
}
