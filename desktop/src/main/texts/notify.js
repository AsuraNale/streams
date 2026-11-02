// The Windows notifications of the app (services/notify.mjs). The same rules as every text table: the wording scanner,
// full-width punctuation (test/wording.test.mjs). {n} is a count filled by the caller.

export const NOTIFY = Object.freeze({
  title: '流息',
  kinds: Object.freeze({
    // a pipeline round ended with new items in 待看 (plan C5; nothing sends it yet)
    newItems: '抓到 {n} 条新的，放在「待看」里。',
  }),
})
