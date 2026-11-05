// The Windows notifications of the app (services/notify.mjs). The same rules as every text table: the wording scanner,
// full-width punctuation (test/wording.test.mjs). {n} is a count and {library} a library's name, filled by the caller.

export const NOTIFY = Object.freeze({
  title: '流息',
  kinds: Object.freeze({
    // a pipeline round ended with new items in 待看 (plan C5, A2; services/schedule.mjs sends it, not for 0). v2 package A:
    // the library's name first, since a timed round may be any library's
    newItems: '{library}：这一轮进来 {n} 条待看。',
  }),
})
