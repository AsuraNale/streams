// scriptedConnector(opts): a fakeConnector that answers a check the way an independent checker would (tests, and the desktop's
// development connection STREAMS_DEV_CONNECTION=fake). No process, no network. It reads the prompt it is given:
//   model slot 'verify'   -> a judge answer { items:[{ id, passed, evidence }] } for every [id] the prompt lists
//   anything else         -> json(req, n) when given, else { ok: true }
// opts: { judgePassed (bool | (ids, prompt, n) => bool), judge (fn(ids, prompt, n) => object | undefined),
//         aiFlag (bool | (prompt, n) => bool: the answer to the 「写给 AI 的话」 item, default false = nothing found; judgePassed
//         does not answer that item), json (fn(req, n) => object | undefined), mode (fakeConnector mode), model }
// 1.1 W7b: v1.0's scripted connector, which also answered its scoring steps and its summary step, left core/src with the
// scoring pipeline (core/legacy/pipeline/fake.mjs); this one knows nothing of them.
import { fakeConnector } from './fakes.mjs';
import { AI_JUDGE_ITEM } from '../verify/ai-instructions.mjs';

const JUDGE_ID_RE = /^\[([A-Za-z0-9_.:-]+)\] /gm;

export function judgeIdsOf(prompt) {
  const ids = [];
  for (const m of String(prompt ?? '').matchAll(JUDGE_ID_RE)) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

export function scriptedConnector({ judgePassed = true, aiFlag = false, judge, json: answer, mode = 'counting', model } = {}) {
  const json = (req, n) => {
    if (req.model === 'verify') {
      const ids = judgeIdsOf(req.prompt);
      const custom = typeof judge === 'function' ? judge(ids, req.prompt, n) : undefined;
      if (custom !== undefined) return custom;
      const pass = typeof judgePassed === 'function' ? judgePassed(ids, req.prompt, n) : judgePassed;
      // the 「写给 AI 的话」 item is its own question: answered by aiFlag (default: nothing found), not by judgePassed
      const flagged = typeof aiFlag === 'function' ? Boolean(aiFlag(req.prompt, n)) : Boolean(aiFlag);
      return {
        items: ids.map((id) => (id === AI_JUDGE_ITEM.id
          ? { id, passed: !flagged, evidence: flagged ? 'the material tells the model what to do' : 'no instruction in the material' }
          : { id, passed: Boolean(pass), evidence: pass ? 'found in material' : 'not found in material' })),
      };
    }
    const custom = typeof answer === 'function' ? answer(req, n) : undefined;
    return custom !== undefined ? custom : { ok: true };
  };
  return fakeConnector({ mode, json, model });
}
