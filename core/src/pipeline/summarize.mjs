// The summary node under the verification loop (product spec 4.11; core-api 4.3 "摘要怎么用它").
//
// runSummary({ libraryDir, cfg, node, state, item, body, materials, related, connector, round, now, write })
//   verifyLoop(maxVerifyRounds) around the summary call: round 1 gets the plain prompt; a failed round gets
//   the prior output plus only the failed items with evidence. Passed, or out of rounds: the inbox file is
//   written and the ledger gets `inbox { verified }`; every round's items go to verdicts.jsonl.
//   -> { status: 'inbox', passed, rounds, output, verification, calls }
//   -> { status: 'unscored', reason: 'bad-format', calls }      (no usable output in any round: no inbox)
//   -> { status: 'connection', code, calls }
//   verification = { passed, rounds, failed:[{ id, evidence }], claimsNotFound:[], forgot:[], aiInstruction? }
//   「写给 AI 的话」 (v2 D1): detectAiInstructions on the material + the judge fallback item in the judge call. A mark
//   { source:'rule'|'judge', matches, evidence? } goes on verification.aiInstruction, on every verdicts.jsonl line of
//   the item, as aiInstruction:true on the card and the ledger `inbox` event, and into _pipeline/ai-instructions.jsonl.
//   It never sends the summary back, never changes passed / scores, and every model call is the same as without it.
import { completeJson } from '../connect/complete-json.mjs';
import { appendEvent } from '../library/ledger.mjs';
import { StreamsError } from '../errors.mjs';
import { verifyLoop, appendVerdict, detectAiInstructions, aiInstructionMark, recordMark, readAiInstructions } from '../verify/index.mjs';
import { cfgOf } from './config.mjs';
import { summaryPrompt, materialText } from './prompts.mjs';
import { writeInboxItem } from './inbox.mjs';
import { countingConnector } from './score.mjs';

function scoresOf(state) {
  const out = {};
  for (const [k, v] of Object.entries(state?.scores ?? {})) out[k] = typeof v.score === 'number' ? { score: v.score, reason: v.reason } : { value: v.value, reason: v.reason };
  return out;
}

export function verificationOf(loop) {
  const last = loop.last ?? { items: [], claimsNotFound: [], forgot: [] };
  return {
    passed: loop.passed === true,
    rounds: loop.rounds,
    failed: last.items.filter((it) => !it.passed).map((it) => ({ id: it.id, evidence: it.evidence })),
    claimsNotFound: last.claimsNotFound ?? [],
    forgot: last.forgot ?? [],
  };
}

export async function runSummary({ libraryDir, cfg, node, state, item, body, materials, related = [], topics = [], sourceTopic, connector, round, now = () => new Date(), write = true } = {}) {
  const language = cfg.language;
  const source = materialText({ item, body, bodyMaxChars: cfg.bodyMaxChars });
  const checklist = node.checklist ?? [];
  const counted = countingConnector(connector);
  // redesign R2: the check's calls (the judge of the verification loop), counted apart — they are in counted.calls() too
  const judge = countingConnector(counted.connector);
  let connection = null;

  const produce = async (feedback, prior) => {
    const prompt = summaryPrompt({ node, item, body, related, topics, sourceTopic, language, bodyMaxChars: cfg.bodyMaxChars, checklist, feedback, prior });
    const r = await completeJson(counted.connector, { prompt, format: 'json', model: 'main' }, { retries: 1 });
    if (!r.ok) {
      if (r.code !== 'bad-format') {
        connection = r;
        throw new StreamsError('connection', r.detail ?? r.code, { connectionCode: r.code });
      }
      return { output: {}, claimed: [], calls: 0 }; // unreadable twice: the rules fail and the verification loop's following round is the second chance (a round of the loop, not a run: redesign R6b)
    }
    return { output: r.json, claimed: Array.isArray(r.json?.claimed) ? r.json.claimed : [], calls: 0 };
  };

  // 「写给 AI 的话」 (v2 D1): the fixed patterns on the material, before and independent of every model call; the judge
  // fallback rides in the existing judge call (aiCheck). Neither changes a prompt, a retry or a score.
  const rule = detectAiInstructions(source);

  let loop;
  try {
    loop = await verifyLoop({ task: 'summary', checklist, source, connector: judge.connector, produce, maxRounds: cfg.maxVerifyRounds, aiCheck: true });
  } catch (e) {
    if (connection) return { status: 'connection', code: connection.code, detail: connection.detail, calls: counted.calls(), judgeCalls: judge.calls() };
    throw e;
  }

  const ts = now().toISOString();
  const aiInstruction = aiInstructionMark(rule, loop.history.map((h) => h.aiJudge));
  if (write) {
    loop.history.forEach((h, i) => appendVerdict(libraryDir, { node: node.id, url: item.url, round: i + 1, items: h.items, ts, ...(aiInstruction ? { aiInstruction } : {}) }));
    if (aiInstruction) recordMark(libraryDir, aiInstruction, { at: ts, source: item.source ?? state?.source ?? '', itemId: item.url, node: node.id });
  }
  if (loop.last?.code && loop.last.code !== 'bad-format') {
    return { status: 'connection', code: loop.last.code, detail: 'judge call failed', calls: counted.calls(), judgeCalls: judge.calls() };
  }
  const output = loop.output;
  if (!output || typeof output.what !== 'string') {
    if (write) appendEvent(libraryDir, { ts, ev: 'unscored', url: item.url, node: node.id, reason: 'bad-format', cfg: cfgOf(node), round });
    return { status: 'unscored', reason: 'bad-format', calls: counted.calls(), judgeCalls: judge.calls() };
  }
  const verification = verificationOf(loop);
  if (aiInstruction) verification.aiInstruction = aiInstruction;
  // the inbox event carries the mark when this summary found one, or when an earlier gate already recorded this item
  const marked = Boolean(aiInstruction) || (write && readAiInstructions(libraryDir).some((l) => l.itemId === item.url));
  const card = {
    url: item.url,
    title: item.title ?? state?.title ?? '',
    source: item.source ?? state?.source ?? '',
    date: item.date ?? state?.date ?? '',
    scores: scoresOf(state),
    summary: { what: output.what, points: Array.isArray(output.points) ? output.points : [], quote: typeof output.quote === 'string' ? output.quote : '' },
    verification,
    materials: materials ?? (typeof body === 'string' && body !== '' ? 'body' : 'summary-only'),
    round,
    inboxAt: ts,
  };
  if (state?.maybeDuplicateOf) card.maybeDuplicateOf = state.maybeDuplicateOf;
  if (marked) card.aiInstruction = true;
  if (write) {
    writeInboxItem(libraryDir, card);
    appendEvent(libraryDir, { ts, ev: 'inbox', url: item.url, round, verified: verification.passed, ...(marked ? { aiInstruction: true } : {}) });
  }
  return { status: 'inbox', passed: verification.passed, rounds: loop.rounds, output, verification, calls: counted.calls(), judgeCalls: judge.calls(), ...(aiInstruction ? { aiInstruction } : {}) };
}
