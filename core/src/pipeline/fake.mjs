// scriptedConnector(opts): a fakeConnector whose answers follow the shape each prompt asks for
// (tests, and `streams-core run --connection fake`). It reads the prompt it is given:
//   model slot 'verify'            -> a judge answer { items:[{ id, passed, evidence }] } for every [id] it finds
//   a format line with "points"    -> a summary { what, points[3], quote, claimed }
//   a format line with a score key -> a gate answer { <key>: score, enum fields, reason, quote }
// `quote` is the item's title read off the material block, so quote_in_source passes by default.
//
// opts: { score (number | (nodeId, prompt, n) => number), freshness, judgePassed (bool | (ids, prompt, n) => bool),
//         summary (fn(prompt, n) => object | undefined), gate (fn(nodeId, prompt, n) => object | undefined),
//         judge (fn(ids, prompt, n) => object | undefined), mode (fakeConnector mode), what, points }
import { fakeConnector } from '../connect/fakes.mjs';

const TITLE_RE = /^(?:标题：|Title: )(.*)$/m;
const SCORE_RE = /"([A-Za-z0-9_-]+)": (?:0到1的小数|a number from 0 to 1)/;
const ENUM_RE = /"([A-Za-z0-9_-]+)": ("[A-Za-z0-9_-]+"(?:\|"[A-Za-z0-9_-]+")+)/g;
const JUDGE_ID_RE = /^\[([A-Za-z0-9_.:-]+)\] /gm;

export function titleOf(prompt) {
  return TITLE_RE.exec(prompt)?.[1]?.trim() ?? '';
}

export function scoreKeyOf(prompt) {
  return SCORE_RE.exec(prompt)?.[1] ?? null;
}

export function judgeIdsOf(prompt) {
  const ids = [];
  for (const m of prompt.matchAll(JUDGE_ID_RE)) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

export function promptKind(req) {
  if (req.model === 'verify') return 'judge';
  if (/"points": \[/.test(req.prompt)) return 'summary';
  if (scoreKeyOf(req.prompt)) return 'gate';
  return 'other';
}

export function scriptedConnector({
  score = 0.8, freshness = 'new', judgePassed = true, summary, gate, judge, mode = 'counting',
  what = 'a fake item for tests', points = ['point one', 'point two', 'point three'], reason = 'scripted answer', model,
} = {}) {
  const json = (req, n) => {
    const kind = promptKind(req);
    const title = titleOf(req.prompt);
    if (kind === 'judge') {
      const ids = judgeIdsOf(req.prompt);
      const custom = typeof judge === 'function' ? judge(ids, req.prompt, n) : undefined;
      if (custom !== undefined) return custom;
      const pass = typeof judgePassed === 'function' ? judgePassed(ids, req.prompt, n) : judgePassed;
      return { items: ids.map((id) => ({ id, passed: Boolean(pass), evidence: pass ? 'found in material' : 'not found in material' })) };
    }
    if (kind === 'summary') {
      const custom = typeof summary === 'function' ? summary(req.prompt, n) : undefined;
      if (custom !== undefined) return custom;
      const ids = judgeIdsOf(req.prompt);
      return { what: `${what}: ${title}`, points: [...points], quote: title, claimed: ids };
    }
    if (kind === 'gate') {
      const key = scoreKeyOf(req.prompt);
      const custom = typeof gate === 'function' ? gate(key, req.prompt, n) : undefined;
      if (custom !== undefined) return custom;
      const out = { [key]: typeof score === 'function' ? score(key, req.prompt, n) : score };
      for (const m of req.prompt.matchAll(ENUM_RE)) {
        const options = m[2].split('|').map((s) => JSON.parse(s));
        out[m[1]] = m[1] === 'freshness' && options.includes(freshness) ? freshness : options[0];
      }
      out.reason = reason;
      out.quote = title;
      return out;
    }
    return { ok: true };
  };
  return fakeConnector({ mode, json, model });
}
