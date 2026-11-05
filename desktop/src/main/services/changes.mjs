/**
 * 「谁定的」 for what the user changes directly (v2 package B; docs/desktop.md §4.5, docs/core-api.md 5.13): the bridge methods
 * of v1.0 that change a library's sources, topics, thresholds, schedule or cap go through `byYou`, which reads those fields
 * before and after the change and writes one line by 'you' into the library's _pipeline/changes.jsonl for each field that
 * changed (core recordChanges). A change that fails writes no line (the error goes on up, as before); a line that cannot be
 * written is said in the log and the change stands. A confirmed proposal card writes its own lines (by 'agent-confirmed',
 * core confirmProposal).
 * @module desktop/main/services/changes
 */

import { recordChanges, snapshot } from '../core.mjs'

/**
 * Run `change` (synchronous) on the library folder `dir`, then record what it changed of `fields` as the user's.
 * @template T
 * @param {string} dir
 * @param {string[]} fields - of core CHANGE_FIELDS
 * @param {() => T} change
 * @param {{log: (line: string) => void, now?: () => Date}} o
 * @returns {T} what `change` returned
 */
export function byYou(dir, fields, change, { log, now = () => new Date() }) {
  let before = null
  try { before = snapshot(dir, fields) } catch (err) { log(`changes: ${fields.join(', ')} unreadable before a change, not recorded: ${String(err?.message ?? err)}`) }
  const r = change()
  if (before) {
    try {
      const lines = recordChanges(dir, before, snapshot(dir, fields), { by: 'you', now })
      if (lines.length) log(`changes: by you: ${lines.map(l => l.field).join(', ')}`)
    } catch (err) {
      log(`changes: not recorded: ${String(err?.message ?? err)}`)
    }
  }
  return r
}
