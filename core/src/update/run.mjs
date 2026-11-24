// One update of a library (1.1 W5; handoff 改动五; contract 「总原则」): one run of the update agent, the code before and
// after it. Before: the card's sources are read for links not seen before, and those pages' originals are fetched and
// kept — the agent's starting material, not all it may look at. No new link, nothing carried over, and the card's rhythm
// not due: no agent at all (B9). After: what it hands in (the action submit_items of the definition) is checked one item
// at a time — already in the library, a source it never read, the original kept, the summary against the original (W3).
//
// runUpdate(libraryDir, { connector, judge, readPage, readLinks, definition, budget, sopDir, now, kind, round, search })
//   kind / search (1.1.1 P3, P4): the update agent's tools as its connection has them; search false (an API connection with no
//   search service): the agent is told of reading pages only
//   connector  the update agent's session with the web tools: createSessionConnector(connection, deps, { cwd, web: true })
//              (detect() first: not logged in -> the update does not start, B12)
//   judge      a connection for the one independent judgment of each item's check (complete(); zero tools)
//   readPage   read(url) of read/read-page.mjs (three ways); readLinks: read(url) of links.mjs
// -> { started, status, problems?, record }
//   status   'login-expired' (not started) · 'no-card' (not started) · 'nothing-new' · 'done' · 'summary-not-written' ·
//            'connection' · 'stopped'
//   record   the line written to _pipeline/rounds.jsonl (kind 'update'): counts, the sources left unread, calls
// One run = one session: the first call; once more when the answer was not readable; once more with the items whose
// check failed. Each item's check has its own judge call. No score, no pass mark: what to hand in is the agent's call.
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSop, renderSop } from '../sop/sop.mjs';
import { loadDefinition } from '../actions/definition.mjs';
import { createActionRunner } from '../actions/actions.mjs';
import { answerJson } from '../agentrun/stream.mjs';
import { readCard, CARD_DIR, CARD_MD } from '../build/store.mjs';
import { sameUrl } from '../build/card.mjs';
import { saveOriginal, readOriginal, originalId } from '../read/original.mjs';
import { replayLedger } from '../library/ledger.mjs';
import { appendRoundRecord } from '../pipeline/rounds-log.mjs';
import { checkSummary } from '../verify/summary.mjs';
import { detectAiInstructions } from '../verify/ai-instructions.mjs';
import { readState, writeState, sweepDaysOf } from './state.mjs';
import { putInInbox, putMissingInInbox } from './inbox.mjs';
import { cleanLink } from './links.mjs';
import { UPDATE_BUDGET, UPDATE_OUTPUT, updateToolsText, updateBudgetText, updateActionsText, stateText, newText } from './format.mjs';
import { readFileSync, existsSync } from 'node:fs';

const DAY_MS = 86_400_000;
// how much of an item's kept original goes back with it when its check failed
export const FEEDBACK_TEXT_CHARS = 8000;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export async function runUpdate(libraryDir, {
  connector, judge, readPage, readLinks, definition = loadDefinition(), budget = UPDATE_BUDGET, sopDir, now = () => new Date(), round,
  pendingDir = join(tmpdir(), 'streams-update-pending'), signal = null, kind = 'claude-code', search = true,
} = {}) {
  // 1.1 W7a: 停止 (signal aborted) — no more sources or pages are read; what was kept stays, the sources not read stay for the
  // next update, the originals kept are carried to it; no agent run starts. The record says 'cancelled'.
  const stopped = () => signal?.aborted === true;
  const startedAt = now().toISOString();
  const id = round ?? `u-${startedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
  const card = readCard(libraryDir);
  if (!card) return { started: false, status: 'no-card', problems: [{ code: 'no-card' }] };

  // B12: a connection that is not logged in does not start an update: nothing read, nothing written
  try {
    const d = await connector.detect?.();
    if (d && (d.loggedIn === false || d.code === 'login-expired' || d.code === 'not-logged-in')) return { started: false, status: 'login-expired', problems: [{ code: d.code ?? 'login-expired' }] };
  } catch { /* a detect that fails is not a sign-in answer: the first call will say */ }

  const state = readState(libraryDir);
  // 1.1.1 P11b (A13): unreadable — the sources read this time that could not be read (待看's 「这次更新」 line says how many)
  const counts = { sources: (card.sources ?? []).length, read: 0, unreadable: 0, newLinks: 0, originals: 0, missing: 0, carried: state.carry.length, items: 0, inbox: 0, dropped: 0 };

  // ---- the sources: the ones left unread last time first, then the card's order; as many as the budget takes (B11)
  const cardUrls = (card.sources ?? []).map((s) => s.url).filter((u) => typeof u === 'string' && u !== '');
  const order = [...state.unfinished.filter((u) => cardUrls.includes(u)), ...cardUrls.filter((u) => !state.unfinished.includes(u))];
  const toRead = order.slice(0, budget.sources);
  const unfinished = order.slice(budget.sources);
  const fresh = []; // { url, source }
  for (const src of toRead) {
    if (stopped()) break;
    const r = await readLinks(src);
    counts.read += 1;
    if (!r.ok) counts.unreadable += 1;
    const prev = state.sources[src];
    const entry = { ...(prev ?? {}), ok: r.ok, ...(r.ok ? {} : { reason: r.reason ?? 'failed' }), method: r.method ?? null };
    if (r.ok) delete entry.reason;
    if (!prev) entry.firstAt = startedAt;
    if (r.ok) {
      // 1.1.1 P7 (B22): links kept by an earlier version may still carry tracking parameters: compared cleaned; one address is
      // fetched once in an update, from the first source it is new on
      const seen = new Set((prev?.seen ?? []).map(cleanLink));
      if (prev && Array.isArray(prev.seen)) for (const l of r.links) if (!seen.has(cleanLink(l)) && !fresh.some((f) => f.url === l)) fresh.push({ url: l, source: src });
      // the first time a source is read its links are only noted: they are what was there before the library existed
      entry.seen = [...(prev?.seen ?? []), ...r.links.filter((l) => !seen.has(l))];
    }
    state.sources[src] = entry;
  }
  // links beyond the budget of one update are not marked seen: the next update finds them again
  const take = fresh.slice(0, budget.newLinks);
  for (const f of fresh.slice(budget.newLinks)) {
    const e = state.sources[f.source];
    e.seen = e.seen.filter((l) => l !== f.url);
  }
  counts.newLinks = take.length;
  state.unfinished = [...toRead.slice(counts.read), ...unfinished];

  // ---- the new pages' originals (W2): kept before the agent sees them, so nothing fetched is lost whatever it answers
  const originals = [];
  const missing = [];
  for (const c of state.carry) {
    const o = readOriginal(libraryDir, c.id ?? originalId(c.url));
    if (o) originals.push({ url: c.url, title: o.title, text: o.text, method: o.method, source: c.source ?? '' });
  }
  for (const [i, f] of take.entries()) {
    if (stopped()) {
      // the links not fetched are not marked seen: the next update finds them again
      for (const g of take.slice(i)) { const e = state.sources[g.source]; e.seen = e.seen.filter((l) => l !== g.url); }
      break;
    }
    const r = await readPage(f.url);
    // 1.1 W6a (A5): what the source's pages came to, for the 「原文」 column of 来源与要求 (sources.mjs sourceRows)
    const e = state.sources[f.source];
    e.pages = { read: 0, pdf: 0, missing: 0, ...(e.pages ?? {}) };
    e.pages[r.ok ? (r.method === 'pdf' ? 'pdf' : 'read') : 'missing'] += 1;
    if (r.ok) {
      saveOriginal(libraryDir, { url: f.url, title: r.title ?? '', text: r.text, method: r.method, fetchedAt: now() });
      originals.push({ url: f.url, title: r.title ?? '', text: r.text, method: r.method, source: f.source });
      counts.originals += 1;
    } else {
      missing.push({ url: f.url, reason: r.reason ?? 'no-article', source: f.source });
      counts.missing += 1;
    }
  }

  const sweepDays = sweepDaysOf(card);
  const sweepDue = !state.lastAgentAt || now().getTime() - Date.parse(state.lastAgentAt) >= sweepDays * DAY_MS;
  // an item's source is shown by the card's own name for it (W6a: the line of a 待看 card), not by its address
  const nameOf = (url) => (url ? (card.sources ?? []).find((x) => x.url === url)?.name ?? url : '');
  const finish = (status, extra = {}) => {
    writeState(libraryDir, state);
    const record = { id, kind: 'update', startedAt, finishedAt: now().toISOString(), status, counts, unfinished: state.unfinished, sweep: sweepDue, ...extra };
    appendRoundRecord(libraryDir, record);
    return { started: true, status, record, ...(extra.problems ? { problems: extra.problems } : {}) };
  };

  if (stopped()) {
    state.carry = originals.map((o) => ({ url: o.url, id: originalId(o.url), source: o.source }));
    return finish('cancelled', { calls: 0 });
  }
  if (originals.length === 0 && missing.length === 0 && !sweepDue) {
    // B9: nothing new — no model call; the state is written only if a source's own answer changed (writeState compares)
    return finish('nothing-new', { calls: 0 });
  }

  // ---- the one agent run
  // 1.1.1 P7: the card's samples are had too (W11's code drops a resubmitted one; now the agent is told so)
  const samples = (Array.isArray(card.samples) ? card.samples : []).filter((s) => isObj(s) && typeof s.url === 'string' && s.url !== '');
  const known = [...[...replayLedger(libraryDir).states.values()].map((s) => ({ url: s.url, title: s.title ?? '' })), ...samples.map((s) => ({ url: s.url, title: `${s.title ?? ''}（建库卡上的样例）` }))];
  const cardMd = existsSync(join(libraryDir, CARD_DIR, CARD_MD)) ? readFileSync(join(libraryDir, CARD_DIR, CARD_MD), 'utf8') : JSON.stringify(card, null, 2);
  const prompt = renderSop(loadSop('update', sopDir ? { dir: sopDir } : {}), {
    TODAY: startedAt.slice(0, 10), TOOLS: updateToolsText(kind, { search }), BUDGET: updateBudgetText(budget, { search, hard: kind === 'api' }), CARD: cardMd,
    STATE: stateText({ lastAgentAt: state.lastAgentAt, known, unfinished: state.unfinished, sources: state.sources, queries: (card.sources ?? []).filter((s) => !s.url && s.query).map((s) => s.query), sweep: sweepDue ? (state.lastAgentAt ? Math.floor((now().getTime() - Date.parse(state.lastAgentAt)) / DAY_MS) : 1) : 0 }),
    NEW: newText(originals, missing), ACTIONS: updateActionsText(definition), OUTPUT: UPDATE_OUTPUT,
  });
  let sessionId;
  let calls = 0;
  const reads = [];
  const searches = [];
  const send = async (text) => {
    const r = await connector.send({ prompt: text, format: 'json', model: 'main' }, sessionId ? { sessionId } : {});
    calls += 1;
    if (r.sessionId) sessionId = r.sessionId;
    for (const x of r.reads ?? []) reads.push(x);
    for (const q of r.searches ?? []) searches.push(q);
    return r;
  };
  const carryAll = () => { state.carry = originals.map((o) => ({ url: o.url, id: originalId(o.url), source: o.source })); };
  const parse = (r) => (isObj(r.json) ? r.json : answerJson(r.text));
  const failedConnection = (r) => !r.ok && !(r.code === 'bad-format' && typeof r.text === 'string' && r.text !== '');

  let r = await send(prompt);
  if (failedConnection(r)) { carryAll(); return finish(r.code === 'login-expired' ? 'login-expired' : 'connection', { calls, problems: [{ code: r.code }] }); }
  if ((r.otherTools ?? []).length) { carryAll(); return finish('stopped', { calls, problems: [{ code: 'other-tool' }] }); }
  let answer = parse(r);
  if (!isObj(answer) || !Array.isArray(answer.items)) {
    r = await send('（流息）你上一条回复读不出来。请只交一个 JSON 对象，格式照「交回的格式」，前后不要有别的字。');
    if (failedConnection(r)) { carryAll(); return finish(r.code === 'login-expired' ? 'login-expired' : 'connection', { calls, problems: [{ code: r.code }] }); }
    answer = parse(r);
  }
  state.lastAgentAt = startedAt;
  state.used = { searches: searches.length, reads: reads.length };
  if (!isObj(answer) || !Array.isArray(answer.items)) {
    // B13: twice unreadable — 「摘要没写出来」; the originals stay and go to the next update's agent
    carryAll();
    return finish('summary-not-written', { calls });
  }
  state.carry = [];

  // ---- what it hands in, through the definition's action (an AI changes things only through actions, W1)
  let taken = null;
  const runner = createActionRunner({
    definition, pendingDir, logFile: () => join(libraryDir, '_actions.jsonl'), now,
    handlers: {
      submit_items: async (params) => {
        taken = await takeItems(params.items);
        return { object: { type: 'item', id: libraryDir }, before: null, after: { inbox: taken.inbox.length, missing: taken.missing.length, dropped: taken.dropped } };
      },
    },
  });

  async function takeItems(items) {
    const ledger = replayLedger(libraryDir).states;
    // 1.1 W11: the card's samples count as had — the user saw and confirmed them with the card (C5 rerun, persona 1)
    const sampleUrls = (Array.isArray(card.samples) ? card.samples : []).map((s) => (isObj(s) && typeof s.url === 'string' ? s.url : '')).filter(Boolean);
    const knownUrls = [...ledger.keys(), ...sampleUrls];
    const out = { inbox: [], missing: [], dropped: [] };
    const ready = [];
    for (const it of items) {
      if (!isObj(it) || typeof it.url !== 'string' || it.url.trim() === '') { out.dropped.push({ url: null, why: 'bad-item' }); continue; }
      const url = it.url.trim();
      if (knownUrls.some((k) => sameUrl(k, url)) || ready.some((x) => sameUrl(x.url, url))) { out.dropped.push({ url, why: 'already' }); continue; }
      const handed = originals.find((o) => sameUrl(o.url, url));
      const opened = reads.some((x) => sameUrl(x.url, url));
      if (!handed && !opened) { out.dropped.push({ url, why: 'not-read' }); continue; }
      const key = handed ? handed.url : url;
      const item = { url: key, title: typeof it.title === 'string' ? it.title : handed?.title ?? '', date: typeof it.date === 'string' ? it.date : '', due: it.due, why: it.why, source: nameOf(handed?.source) };
      let stored = readOriginal(libraryDir, originalId(key));
      if (!stored) {
        const page = await readPage(key);
        if (page.ok) { saveOriginal(libraryDir, { url: key, title: page.title ?? item.title, text: page.text, method: page.method, fetchedAt: now() }); stored = readOriginal(libraryDir, originalId(key)); counts.originals += 1; }
        else { putMissingInInbox(libraryDir, { item, reason: page.reason ?? 'no-article', round: id, now }); out.missing.push(key); continue; }
      }
      ready.push({ ...item, summary: { what: it.what, points: it.points }, text: stored.text });
    }
    // the check (W3), first round: each item's summary as it was handed in
    const first = [];
    for (const x of ready) first.push(await checkSummary({ libraryDir, url: x.url, title: x.title, connector: judge, maxRounds: 1, produce: async () => ({ output: x.summary, claimed: [], calls: 0 }) }));
    // the failed ones go back to the agent once, together, in the same session
    const failed = ready.map((x, i) => ({ x, c: first[i] })).filter(({ c }) => c.status === 'checked' && !c.passed);
    let revised = new Map();
    if (failed.length) {
      // each with the original Streams kept (what the check reads): the agent's own reading tool may have shown it other words
      const why = failed.map(({ x, c }) => `### ${x.url}\n没过的地方：${c.verification.failed.map((f) => `${f.id}（${f.evidence}）`).join('；')}\n流息存下的原文（原话从这里抄）：\n${x.text.length > FEEDBACK_TEXT_CHARS ? `${x.text.slice(0, FEEDBACK_TEXT_CHARS)}……` : x.text}`).join('\n\n');
      const back = await send(`（流息）下面几条的摘要没有通过核验：每个要点的原话要逐字在原文里，数字要在原文里找得到，标题和摘要要说同一件事（标题也可以改）。请按原因改，只重交这几条，格式同「交回的格式」：\n${why}`);
      const again = failedConnection(back) ? null : parse(back);
      for (const it of Array.isArray(again?.items) ? again.items : []) if (isObj(it) && typeof it.url === 'string') revised.set(it.url.trim(), it);
    }
    for (let i = 0; i < ready.length; i++) {
      let x = ready[i];
      let checked = first[i];
      const re = [...revised.entries()].find(([u]) => sameUrl(u, x.url))?.[1];
      if (checked.status === 'checked' && !checked.passed && re) {
        // 1.1 W11: the title may come back changed with the summary
        const title = typeof re.title === 'string' && re.title.trim() !== '' ? re.title.trim() : x.title;
        const second = await checkSummary({ libraryDir, url: x.url, title, connector: judge, maxRounds: 1, produce: async () => ({ output: { what: re.what, points: re.points }, claimed: [], calls: 0 }) });
        if (second.status === 'checked') { checked = { ...second, rounds: 2, history: [...first[i].history, ...second.history], verification: { ...second.verification, rounds: 2 } }; x = { ...x, title }; }
      }
      if (checked.status !== 'checked') { putMissingInInbox(libraryDir, { item: x, missing: null, reason: 'summary-not-written', round: id, now }); out.missing.push(x.url); continue; }
      const ai = detectAiInstructions(x.text);
      putInInbox(libraryDir, { item: x, checked, round: id, now, aiInstruction: ai.hit ? { source: 'rule', matches: ai.matches } : null });
      out.inbox.push({ url: x.url, verified: checked.passed });
    }
    return out;
  }

  const items = answer.items.slice(0, 30);
  counts.items = items.length;
  const done = await runner.request('update_agent', { action: 'submit_items', params: { items } });
  if (done.status !== 'done' || !taken) return finish('stopped', { calls, problems: [{ code: 'rejected', detail: (done.errors ?? []).join('; ') }] });
  counts.inbox = taken.inbox.length;
  counts.missing += taken.missing.length;
  counts.dropped = taken.dropped.length;
  return finish('done', { calls, dropped: taken.dropped, agent: { searches: searches.length, reads: reads.length, sources: Array.isArray(answer.sources) ? answer.sources : [], gaps: Array.isArray(answer.gaps) ? answer.gaps : [] } });
}
