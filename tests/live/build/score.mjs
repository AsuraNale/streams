// The lines of acceptance C4 for one build run, and for the four together (written before the runs; they are the
// sixth round's, round6-plan.md, on 1.1's card: eight parts, the definition's seven lines).
//   answers      the customer answered at most 6 times
//   questions    every question shown passes checkQuestion, in order (at most 5, ≤ 4 options + 其它, ≤ 2 with no options,
//                the 1st with no options); dropped = how many the code kept from the customer (reported, not a line)
//   built        the customer confirmed a card and the library was made
//   card         the confirmed card is whole: eight parts, the summary and seven lines, at most 3 things to decide
//   urls         every address on the confirmed card was checked in this build (1.1.1 P1, acceptance C8: an open of the model
//                that worked, or Streams' own read — the card entry's checked, or run.checked; an address in 「读不到的来源」
//                needs neither)
//   budget       searches and reads within the build's budget (with the change allowance)
// and for the four: requirements caught ≥ 22 of 26 (the judge's verdicts, one per requirement).
// No model call here: the controls below run on made-up runs and must fail where they are broken.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const core = await import(pathToFileURL(join(REPO, 'core', 'src', 'index.mjs')).href);
const { checkQuestion, checkCard, cardUrls, cardUrlKey: urlKey, BUILD_BUDGET } = core;

export const MAX_ANSWERS = 6;
export const MIN_REQUIREMENTS = 22;
export const TOTAL_REQUIREMENTS = 26;

// the card's addresses neither opened (with a page) by the model nor read by Streams, those in 「读不到的来源」 left out
export function uncheckedUrls(card, run) {
  const ok = new Set((run.reads ?? []).filter((r) => r && r.ok !== false).map((r) => urlKey(r.url)).filter(Boolean));
  for (const [k, v] of Object.entries(run.checked ?? {})) if (v && v.ok === true) ok.add(k);
  for (const part of ['sources', 'samples', 'unreadable']) for (const e of Array.isArray(card[part]) ? card[part] : []) if (e && e.checked && e.checked.ok === true && e.url) ok.add(urlKey(e.url));
  const exempt = new Set((Array.isArray(card.unreadable) ? card.unreadable : []).map((e) => (e && e.url ? urlKey(e.url) : null)).filter(Boolean));
  return cardUrls(card).filter((u) => !exempt.has(urlKey(u)) && !ok.has(urlKey(u)));
}

export function scoreRun(run, { budget = BUILD_BUDGET } = {}) {
  const asked = [];
  let questionsOk = true;
  for (const q of run.questions ?? []) {
    const c = checkQuestion(q, asked);
    if (!c.ok) questionsOk = false;
    asked.push(q);
  }
  const card = run.card ?? null;
  const lines = {
    answers: { ok: (run.answers ?? 0) <= MAX_ANSWERS, value: run.answers ?? 0 },
    questions: { ok: questionsOk && asked.length <= 5, value: asked.length, dropped: run.dropped ?? 0 },
    built: { ok: run.built === true },
    card: { ok: card !== null && checkCard(card, { reads: null }).ok, problems: card ? checkCard(card, { reads: null }).problems : [{ code: 'no-card' }] },
    urls: { ok: card !== null && uncheckedUrls(card, run).length === 0, notRead: card ? uncheckedUrls(card, run) : [] },
    budget: { ok: (run.searches ?? []).length <= budget.searches + budget.changeSearches && (run.reads ?? []).length <= budget.reads + budget.changeReads, searches: (run.searches ?? []).length, reads: (run.reads ?? []).length },
  };
  return { ok: Object.values(lines).every((l) => l.ok), lines };
}

export function scoreAll(runs) {
  const caught = runs.flatMap((r) => (r.verdicts ?? []).filter((v) => v.caught === true));
  const per = runs.map((r) => scoreRun(r));
  const requirements = { ok: caught.length >= MIN_REQUIREMENTS && runs.length === 4, caught: caught.length, of: TOTAL_REQUIREMENTS };
  return { ok: requirements.ok && per.every((p) => p.ok), requirements, runs: per };
}

// ---- controls: made-up runs that are broken in one place each must fail there, and a sound one must pass ----
const WHOLE = () => ({
  name: '样例', definition: { summary: 's', purpose: 'p', scope: 's', exclude: 'e', trust: 't', rhythm: 'r', language: 'l', hard: 'h' },
  decide: [], collect: ['c'], skip: ['k'], sources: [{ name: 'a', url: 'https://a.test/', status: 'ok' }], unreadable: [],
  pick: ['p'], write: ['w'], samples: [{ title: 't', url: 'https://a.test/1', date: '2026-11-21' }],
});
const SOUND = () => ({ answers: 4, questions: [{ text: '用途？', kind: 'input', options: [] }, { text: '地域？', kind: 'single', options: ['a', 'b'] }], built: true, card: WHOLE(), reads: [{ url: 'https://a.test' }, { url: 'https://a.test/1' }], searches: [] });
const verdicts = (n, caught) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, caught: i < caught }));

export function controls() {
  const out = [];
  const expect = (name, got, want) => out.push({ name, ok: got === want, got, want });
  expect('a sound run passes', scoreRun(SOUND()).ok, true);
  const missing = SOUND(); delete missing.card.unreadable;
  expect('a card without 读不到的来源 fails the card line', scoreRun(missing).lines.card.ok, false);
  const noLang = SOUND(); delete noLang.card.definition.language;
  expect('a card without the 语言 line fails the card line', scoreRun(noLang).lines.card.ok, false);
  const unread = SOUND(); unread.card.samples[0].url = 'https://never.test/x';
  expect('a card with an address never read fails the urls line', scoreRun(unread).lines.urls.ok, false);
  const talky = SOUND(); talky.answers = 7;
  expect('7 answers fail the answers line', scoreRun(talky).lines.answers.ok, false);
  const firstChoice = SOUND(); firstChoice.questions[0] = { text: '用途？', kind: 'single', options: ['a', 'b'] };
  expect('a first question with options fails the questions line', scoreRun(firstChoice).lines.questions.ok, false);
  const notBuilt = SOUND(); notBuilt.built = false;
  expect('a run never confirmed fails the built line', scoreRun(notBuilt).lines.built.ok, false);
  // 1.1.1 P1 / C8: what counts as checked
  const failedOpen = SOUND(); failedOpen.reads = [{ url: 'https://a.test', ok: true }, { url: 'https://a.test/1', ok: false }];
  expect('an open that came back as an error does not count', scoreRun(failedOpen).lines.urls.ok, false);
  const streamsRead = SOUND(); streamsRead.reads = [{ url: 'https://a.test' }]; streamsRead.card.samples[0].checked = { ok: true, original: 'read', reason: null };
  expect('an address Streams read itself counts', scoreRun(streamsRead).lines.urls.ok, true);
  const unreadable = SOUND(); unreadable.card.unreadable = [{ name: 'u', url: 'https://u.test/x', reason: '要登录' }];
  expect('an address in 读不到的来源 needs no open', scoreRun(unreadable).lines.urls.ok, true);
  // the 11-24 Codex round (tests/live/build/fixtures/codex-2026-11-24-summary.json): 19 of 26, customer 3 not built
  const nov24 = JSON.parse(readFileSync(join(REPO, 'tests', 'live', 'build', 'fixtures', 'codex-2026-11-24-summary.json'), 'utf8'));
  const nov24Runs = nov24.runs.map((r) => ({ ...SOUND(), built: r.built, verdicts: verdicts(r.of, r.caught) }));
  expect('the 11-24 Codex round (19 of 26, one not built) fails', scoreAll(nov24Runs).ok, false);
  expect('the 11-24 Codex round has 19 requirements caught', scoreAll(nov24Runs).requirements.caught, 19);
  const runs = (c) => [6, 8, 7, 5].map((n, i) => ({ ...SOUND(), verdicts: verdicts(n, i === 0 ? n - (26 - c) : n) }));
  expect('21 of 26 requirements fail the four', scoreAll(runs(21)).requirements.ok, false);
  expect('22 of 26 requirements pass the four', scoreAll(runs(22)).requirements.ok, true);
  expect('three runs instead of four fail', scoreAll(runs(26).slice(0, 3)).requirements.ok, false);
  return { ok: out.every((c) => c.ok), checks: out };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = controls();
  for (const x of c.checks) console.log(`${x.ok ? 'ok  ' : 'BAD '} ${x.name} (got ${x.got})`);
  console.log(c.ok ? 'controls: all as expected' : 'controls: SOME DID NOT FAIL AS THEY SHOULD');
  process.exit(c.ok ? 0 : 1);
}
