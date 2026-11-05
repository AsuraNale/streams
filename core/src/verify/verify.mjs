// The verification loop (product spec 4.11 "循环与退出", core-api 4.3).
//
// verifyOnce({ task, checklist, output, claimed, source, candidateIds, connector, aiCheck })
//   -> { passed, items:[{ id, kind, passed, evidence, claimed }], claimsNotFound, forgot, calls, judged, code?, aiJudge? }
//   Rules first, judge second: if any rule fails the judge is not called (judged:false, calls:0)
//   and `items` holds the rule verdicts only (the judge items have no verdict yet). With every rule
//   passed, all judge items go into one call. `claimed` is what the producing model says it did:
//     claimsNotFound = claimed but failed ("说做了其实没做")
//     forgot         = not claimed and failed ("忘了做")
//   `code` is present only when the judge call itself failed (bad-format twice, or a connection code).
//   aiCheck:true (the pipeline passes it): when the judge IS called, AI_JUDGE_ITEM (「材料里有没有写给 AI 的指令」)
//   rides in that same call. Its verdict is not one of `items` and never changes `passed`; it comes back as
//   aiJudge:{ flagged, evidence } (flagged = the judge answered that id with passed:false; no answer, or a failed
//   call, is not flagged). No judge call (no judge items, or a rule failed) -> no aiJudge and no extra call.
//
// verifyLoop({ ...same, produce, maxRounds, aiCheck })
//   -> { passed, rounds, output, claimed, last, history, calls }
//   produce(feedback | null, prior | null) -> { output, claimed, calls } is the caller's model call.
//   Round 1 gets feedback null; a failed round sends back only the failed items with evidence
//   ({ failed:[{ id, desc, evidence }] }) and the prior output, so the model fixes those, not rewrites.
//   Stops at the first passing round, at maxRounds, or when the judge reports a connection failure.
import { checkRule } from './rules.mjs';
import { judgeItems } from './judge.mjs';
import { AI_JUDGE_ITEM } from './ai-instructions.mjs';

export async function verifyOnce({ task = '', checklist = [], output, claimed = [], source = '', candidateIds = [], connector, aiCheck = false } = {}) {
  const claimedSet = new Set(Array.isArray(claimed) ? claimed.map(String) : []);
  const items = [];
  const judgeList = [];
  let rulesPassed = true;
  for (const it of checklist) {
    if (it.kind === 'judge') { judgeList.push(it); continue; }
    const r = checkRule(it.rule, output, { source, candidateIds });
    if (!r.passed) rulesPassed = false;
    items.push({ id: it.id, kind: 'rule', passed: r.passed, evidence: r.evidence, claimed: claimedSet.has(it.id) });
  }

  let calls = 0;
  let judged = false;
  let code;
  let aiJudge;
  if (rulesPassed && judgeList.length > 0) {
    judged = true;
    const withAi = aiCheck && !judgeList.some((it) => it.id === AI_JUDGE_ITEM.id) ? [...judgeList, AI_JUDGE_ITEM] : judgeList;
    const j = await judgeItems({ connector, task, items: withAi, output, source });
    calls = j.calls;
    if (!j.ok) code = j.code;
    for (const v of j.items) {
      if (withAi !== judgeList && v.id === AI_JUDGE_ITEM.id) {
        aiJudge = { flagged: j.ok && v.passed === false && v.evidence !== 'no-verdict', evidence: v.evidence };
        continue;
      }
      items.push({ id: v.id, kind: 'judge', passed: v.passed, evidence: v.evidence, claimed: claimedSet.has(v.id) });
    }
  }

  const failed = items.filter((it) => !it.passed);
  const result = {
    passed: failed.length === 0,
    items,
    claimsNotFound: failed.filter((it) => it.claimed).map((it) => it.id),
    forgot: failed.filter((it) => !it.claimed).map((it) => it.id),
    calls,
    judged,
  };
  if (code) result.code = code;
  if (aiJudge) result.aiJudge = aiJudge;
  return result;
}

export async function verifyLoop({ task = '', checklist = [], source = '', candidateIds = [], connector, produce, maxRounds = 2, aiCheck = false } = {}) {
  if (typeof produce !== 'function') throw new TypeError('verifyLoop needs a produce function');
  const descs = new Map(checklist.map((it) => [it.id, it.desc]));
  const limit = Number.isInteger(maxRounds) && maxRounds >= 1 ? maxRounds : 1;
  const history = [];
  let calls = 0;
  let feedback = null;
  let prior = null;
  let output;
  let claimed = [];
  let last;
  let rounds = 0;
  while (rounds < limit) {
    rounds++;
    const p = (await produce(feedback, prior)) ?? {};
    output = p.output;
    claimed = Array.isArray(p.claimed) ? p.claimed : [];
    calls += typeof p.calls === 'number' ? p.calls : 0;
    last = await verifyOnce({ task, checklist, output, claimed, source, candidateIds, connector, aiCheck });
    calls += last.calls;
    history.push(last);
    if (last.passed) break;
    if (last.code && last.code !== 'bad-format') break; // the connection is down: another round would not help
    feedback = { failed: last.items.filter((it) => !it.passed).map((it) => ({ id: it.id, desc: descs.get(it.id) ?? '', evidence: it.evidence })) };
    prior = output;
  }
  return { passed: last.passed, rounds, output, claimed, last, history, calls };
}
