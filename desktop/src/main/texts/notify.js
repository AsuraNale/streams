// The Windows notifications of the app (services/notify.mjs). The same rules as every text table: the wording scanner,
// full-width punctuation (test/wording.test.mjs). {n} is a count and {library} a library's name, filled by the caller.

export const NOTIFY = Object.freeze({
  title: '流息',
  kinds: Object.freeze({
    // a run ended with new items in 待看 (plan C5, A2; services/schedule.mjs sends it, not for 0). v2 package A: the library's
    // name first, since a timed run may be any library's. Redesign R6b-2: 05 第 173 行's sentence (本次运行新增 n 条待看)
    newItems: '{library}：本次运行新增 {n} 条待看。',
    // 1.1.1 P8 (A12, B23): 快到期, 7 days and 1 day before a deadline (services/due-notify.mjs); {count} items owed at once
    dueDays: '{library}：「{title}」还有 {n} 天到期。',
    dueTomorrow: '{library}：「{title}」明天到期。',
    dueToday: '{library}：「{title}」今天到期。',
    dueMany: '{library}：{count} 条快到期，最近的一条是「{title}」。',
  }),
})
