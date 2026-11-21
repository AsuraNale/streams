// A source's state from reading it (1.1 W2, acceptance B8). The six states of 1.1 are the five of 1.0 and 「要登录」:
//   ok       the source was read, with something new            正常
//   empty    read, nothing new (a 200 with nothing in it too)    无更新
//   gap      the address is gone (404 / 410) or not an address   地址无效
//   failed   the server said "later" (429 / 503 / a timeout)     暂时失败
//   blocked  refused even after the other way of reading (403), or a human check
//                                                                访问被拒
//   login    the site asks to sign in: this version only says it cannot read it
//                                                                要登录
// The words and what to do for each are the core's (agent/words.mjs) and the page's (texts/common.js), one table each.
// sourceStateOf(read, { newLinks }) -> { state, hint, message }
import { hintOf } from '../fetch/states.mjs';

const BY_REASON = Object.freeze({ dead: 'gap', failed: 'failed', blocked: 'blocked', check: 'blocked', login: 'login', 'no-article': 'empty' });

export function sourceStateOf(read, { newLinks = 0 } = {}) {
  let state;
  if (read?.ok) state = newLinks > 0 ? 'ok' : 'empty';
  else state = BY_REASON[read?.reason] ?? 'failed';
  return { state, hint: hintOf(state), message: read?.message ?? '' };
}
