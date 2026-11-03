// The summary node under the verification loop (product spec 4.11; core-api 4.3 "摘要怎么用它").
//
// runSummary({ libraryDir, cfg, node, state, item, body, materials, related, connector, round, now, write })
//   verifyLoop(maxVerifyRounds) around the summary call: round 1 gets the plain prompt; a failed round gets
//   the prior output plus only the failed items with evidence. Passed, or out of rounds: the inbox file is
//   written and the ledger gets `inbox { verified }`; every round's items go to verdicts.jsonl.
//   -> { status: 'inbox', passed, rounds, output, verification, calls }
//   -> { status: 'unscored', reason: 'bad-format', calls }      (no usable output in any round: no inbox)
//   -> { status: 'connection', code, calls }
//   verification = { passed, rounds, failed:[{ id, evidence }], claimsNotFound:[], forgot:[] }
import { completeJson } from '../connect/complete-json.mjs';
import { appendEvent } from '../library/ledger.mjs';
import { StreamsError } from '../errors.mjs';
import { verifyLoop, appendVerdict } from '../verify/index.mjs';
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
  let connection = null;

  const produce = async (feedback, prior) => {
    const prompt = summaryPrompt({ node, item, body, related, topics, sourceTopic, language, bodyMaxChars: cfg.bodyMaxChars, checklist, feedback, prior });
    const r = await completeJson(counted.connector, { prompt, format: 'json', model: 'main' }, { retries: 1 });
    if (!r.ok) {
      if (r.code !== 'bad-format') {
        connection = r;
        throw new StreamsError('connection', r.detail ?? r.code, { connectionCode: r.code });
      }
      return { output: {}, claimed: [], calls: 0 }; // unreadable twice: the rules fail and the loop's next round is the second chance
    }
    return { output: r.json, claimed: Array.isArray(r.json?.claimed) ? r.json.claimed : [], calls: 0 };
  };

  let loop;
  try {
    loop = await verifyLoop({ task: 'summary', checklist, source, connector: counted.connector, produce, maxRounds: cfg.maxVerifyRounds });
  } catch (e) {
    if (connection) return { status: 'connection', code: connection.code, detail: connection.detail, calls: counted.calls() };
    throw e;
  }

  const ts = now().toISOString();
  if (write) {
    loop.history.forEach((h, i) => appendVerdict(libraryDir, { node: node.id, url: item.url, round: i + 1, items: h.items, ts }));
  }
  if (loop.last?.code && loop.last.code !== 'bad-format') {
    return { status: 'connection', code: loop.last.code, detail: 'judge call failed', calls: counted.calls() };
  }
  const output = loop.output;
  if (!output || typeof output.what !== 'string') {
    if (write) appendEvent(libraryDir, { ts, ev: 'unscored', url: item.url, node: node.id, reason: 'bad-format', cfg: cfgOf(node), round });
    return { status: 'unscored', reason: 'bad-format', calls: counted.calls() };
  }
  const verification = verificationOf(loop);
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
  if (write) {
    writeInboxItem(libraryDir, card);
    appendEvent(libraryDir, { ts, ev: 'inbox', url: item.url, round, verified: verification.passed });
  }
  return { status: 'inbox', passed: verification.passed, rounds: loop.rounds, output, verification, calls: counted.calls() };
}
