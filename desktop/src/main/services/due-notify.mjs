/**
 * 1.1.1 P8 (acceptance A12, B23): 快到期's Windows notifications — 7 days and 1 day before an item's deadline, one each. The
 * core says what is owed and keeps the record (pipeline/due.mjs dueNotices / markDueNotices: each library's
 * _pipeline/due-notices.json, by the item's address), so opening the app twice on one day notifies once, a kept item is
 * notified as well and a dismissed one never. Every library the app knows is looked at: when the app starts, every hour
 * while it runs (a day can pass with the app in the tray), after a run ends and after the computer wakes. Nothing here
 * depends on an update having handed the item in again: the deadlines are read from what is on disk.
 * One notification per library and check: one item → its title and days left; several → how many and the nearest one.
 * It is shown whether or not the window is in front (a deadline is worth saying even then); a click opens that library's
 * 待看 (made the current library first). A notice the system could not show is not recorded: it is owed at the next check.
 * @module desktop/main/services/due-notify
 */

import { dueNotices, markDueNotices } from '../core.mjs'

export const DUE_CHECK_EVERY_MS = 60 * 60 * 1000

/**
 * @param {object} o
 * @param {{entries: () => object[], usable: (p: string) => boolean, handlers: {setActiveLibrary: (id: string) => unknown}}} o.library
 * @param {{notice: (n: object) => boolean}} o.notifier
 * @param {(line: string) => void} o.log
 * @param {() => Date} o.now
 * @param {() => ({dir: string, url: string}|null)} [o.held] - the 放弃 still undoable (services/pipeline.mjs): not notified
 */
export function createDueReminder({ library, notifier, log = () => {}, now = () => new Date(), held = () => null, every = DUE_CHECK_EVERY_MS }) {
  let timer = null

  function kindOf(owed) {
    if (owed.length > 1) return 'dueMany'
    const d = owed[0].days
    return d === 0 ? 'dueToday' : d === 1 ? 'dueTomorrow' : 'dueDays'
  }

  /** Look at every library once; → how many notifications were shown. */
  function check(why) {
    let shown = 0
    for (const e of library.entries()) {
      if (!library.usable(e.path)) continue
      let owed
      try {
        const h = held()
        owed = dueNotices(e.path, { now, hidden: h && h.dir === e.path ? [h.url] : [] })
      } catch (err) { log(`due: ${e.id}: not read (${String(err?.message ?? err)})`); continue }
      if (!owed.length) continue
      const first = owed[0]
      const ok = notifier.notice({
        kind: kindOf(owed), values: { library: e.name ?? '', title: first.title || first.url, n: first.days, count: owed.length },
        screen: 'inbox', always: true,
        before: () => { try { library.handlers.setActiveLibrary(e.id) } catch (err) { log(`due: ${e.id}: not opened (${String(err?.message ?? err)})`) } },
      })
      if (!ok) { log(`due: ${why}: ${e.id}: ${owed.length} owed, the notification was not shown (owed at the next check)`); continue }
      try { markDueNotices(e.path, owed, { now }) } catch (err) { log(`due: ${e.id}: not recorded (${String(err?.message ?? err)})`) }
      log(`due: ${why}: ${e.id}: ${owed.map(o => `${o.notice}-day notice, ${o.days} days left`).join('; ')}`)
      shown += 1
    }
    log(`due: ${why}: looked at every library, ${shown} notification(s)`)
    return shown
  }

  return {
    check,
    start() {
      check('the app started')
      if (timer === null) { timer = setInterval(() => check('the hourly look'), every); timer.unref?.() }
    },
    stop() { if (timer !== null) { clearInterval(timer); timer = null } },
  }
}
