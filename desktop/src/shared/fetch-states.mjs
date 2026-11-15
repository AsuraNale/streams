// The five states a source's fetch ends in (plan 1.7 / 4.5; what the user sees for each: texts/common.js FETCH_STATES).
// Shared by the main process (the pipeline, plan C5) and the page (the sources page, plan C7): pure, no Node, no DOM.
//   ok        new items came
//   empty     the fetch worked and nothing was new
//   gap       the address is wrong or the feed is gone (needs the user)
//   failed    a temporary failure (network, timeout): tried again next run
//   blocked   the site refused us (403, a bot wall): the user decides
export const FETCH_STATES = Object.freeze(['ok', 'empty', 'gap', 'failed', 'blocked'])

export const isFetchState = v => FETCH_STATES.includes(v)
