// 11-19 prototype (core/src/agentrun/): the model finds and reads, the code checks. Every guard has an input it drops and
// one it keeps; the runner is driven by a fake child process (no real Claude Code here); two rounds in a row show that the
// second gets the first's sources and seen items and drops a repeat. Nothing here may touch notes/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkItems, checkSources, urlKey, letters, windowOf, QUOTE_MIN } from '../src/agentrun/guards.mjs';
import { parseStream, answerJson } from '../src/agentrun/stream.mjs';
import { buildPrompt } from '../src/agentrun/frame.mjs';
import { claudeAgentArgs, runClaude, runAgentRound, readState } from '../src/agentrun/run.mjs';
import { CLAUDE_FIXED_ARGS } from '../src/connect/claude-code.mjs';
import { makeLibrary } from './support/fixtures.mjs';

const TODAY = new Date(2026, 10, 19, 10, 0, 0);
const PAGE = 'The Bank of Canada held its policy rate at 2.25 per cent on Wednesday. Governor Tiff Macklem said rents in Ontario are easing.';
const FETCHES = [{ url: 'https://www.bankofcanada.ca/2026/11/rate/', text: `# Rate\n\n${PAGE}` }];
const GOOD = { title: 'Bank of Canada holds at 2.25%', url: 'https://bankofcanada.ca/2026/11/rate?utm_source=x', published: '2026-11-18', source: 'boc', via: 'source', summary: '央行维持 2.25%。', quote: 'held its policy rate at 2.25 per cent', why: '利率决定' };

const reasons = (r) => r.dropped.map((d) => d.reasons);

test('guards: a good item is kept (url matched without www, trailing slash, utm)', () => {
  const r = checkItems({ items: [GOOD], fetches: FETCHES, today: TODAY });
  assert.equal(r.kept.length, 1);
  assert.deepEqual(r.window, { from: '2026-11-12', to: '2026-11-19' });
});

test('guards: each field missing or wrong → shape:<field>', () => {
  for (const [field, value] of [['title', ''], ['summary', '  '], ['quote', undefined], ['url', 'ftp://x/y'], ['published', '18 Nov 2026'], ['via', 'memory']]) {
    const r = checkItems({ items: [{ ...GOOD, [field]: value }], fetches: FETCHES, today: TODAY });
    assert.equal(r.kept.length, 0, field);
    assert.ok(r.dropped[0].reasons.includes(`shape:${field}`), `${field}: ${r.dropped[0].reasons}`);
  }
});

test('guards: out of the 7-day window either way → out-of-window; the edges are in', () => {
  assert.deepEqual(reasons(checkItems({ items: [{ ...GOOD, published: '2026-11-11' }], fetches: FETCHES, today: TODAY })), [['out-of-window']]);
  assert.deepEqual(reasons(checkItems({ items: [{ ...GOOD, published: '2026-11-20' }], fetches: FETCHES, today: TODAY })), [['out-of-window']]);
  assert.equal(checkItems({ items: [{ ...GOOD, published: '2026-11-12' }], fetches: FETCHES, today: TODAY }).kept.length, 1);
  assert.equal(checkItems({ items: [{ ...GOOD, published: '2026-11-19' }], fetches: FETCHES, today: TODAY }).kept.length, 1);
});

test('guards: a page not opened in this run → not-read', () => {
  assert.deepEqual(reasons(checkItems({ items: [{ ...GOOD, url: 'https://bankofcanada.ca/2026/11/other' }], fetches: FETCHES, today: TODAY })), [['not-read']]);
});

test('guards: a quote not in the page → quote-not-found; a short one → quote-too-short; spacing, case and markdown do not matter', () => {
  assert.deepEqual(reasons(checkItems({ items: [{ ...GOOD, quote: 'the bank cut its rate to 2 per cent' }], fetches: FETCHES, today: TODAY })), [['quote-not-found']]);
  assert.deepEqual(reasons(checkItems({ items: [{ ...GOOD, quote: '2.25 per' }], fetches: FETCHES, today: TODAY })), [['quote-too-short']]);
  assert.ok(letters('2.25 per').length < QUOTE_MIN);
  assert.equal(checkItems({ items: [{ ...GOOD, quote: 'HELD  its policy\nrate — at 2.25 per cent' }], fetches: FETCHES, today: TODAY }).kept.length, 1);
});

test('guards: an earlier round kept the url or the title → repeat; the same answer twice → duplicate; more than max → over-limit', () => {
  assert.deepEqual(reasons(checkItems({ items: [GOOD], fetches: FETCHES, seen: [{ url: 'https://www.bankofcanada.ca/2026/11/rate/' }], today: TODAY })), [['repeat']]);
  assert.deepEqual(reasons(checkItems({ items: [GOOD], fetches: FETCHES, seen: [{ title: 'Bank of Canada holds at 2.25 %', url: 'https://elsewhere.example/x' }], today: TODAY })), [['repeat']]);
  assert.deepEqual(reasons(checkItems({ items: [GOOD, { ...GOOD }], fetches: FETCHES, today: TODAY })), [['duplicate']]);
  const many = Array.from({ length: 3 }, (_, i) => ({ ...GOOD, title: `t${i}`, url: `https://bankofcanada.ca/2026/11/r${i}` }));
  const f3 = many.map((m) => ({ url: m.url, text: PAGE }));
  const r = checkItems({ items: many, fetches: f3, today: TODAY, max: 2 });
  assert.equal(r.kept.length, 2);
  assert.deepEqual(reasons(r), [['over-limit']]);
});

test('guards: a source is kept only when it was opened in this run', () => {
  const r = checkSources({ sources: [{ name: 'boc', url: 'https://www.bankofcanada.ca/2026/11/rate/' }, { name: 'never', url: 'https://example.org/feed' }, { name: 'bad', url: 'nope' }], fetches: FETCHES });
  assert.deepEqual(r.kept.map((s) => s.name), ['boc']);
  assert.deepEqual(r.dropped.map((d) => d.reasons), [['not-read'], ['shape:url']]);
  assert.equal(urlKey('https://WWW.Example.com/a/?oc=5#x'), 'example.com/a');
  assert.deepEqual(windowOf(TODAY, 7), { from: '2026-11-12', to: '2026-11-19' });
});

// a stream-json stdout as Claude Code writes it (shape from the 11-18 runs)
function streamOf({ answer, fetches = FETCHES, cost = 0.5, extraTool = null }) {
  const lines = [{ type: 'system', subtype: 'init' }];
  fetches.forEach((f, i) => {
    lines.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `f${i}`, name: 'WebFetch', input: { url: f.url, prompt: 'p' } }] } });
    lines.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `f${i}`, content: [{ type: 'text', text: f.text }] }] } });
  });
  lines.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 's0', name: 'WebSearch', input: { query: 'boc rate' } }] } });
  lines.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 's0', content: 'results' }] } });
  if (extraTool) lines.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: extraTool, input: {} }] } });
  lines.push({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.12 }, seven_day: { utilization: 0.31 } } } });
  lines.push('not json at all');
  lines.push({ type: 'result', is_error: false, result: `Here it is:\n${JSON.stringify(answer)}`, total_cost_usd: cost, num_turns: 9, modelUsage: { 'claude-opus-5-5': {} } });
  return lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');
}

test('stream: fetches with their text, searches, quota, cost, the answer JSON; other tools are listed', () => {
  const p = parseStream(streamOf({ answer: { items: [GOOD] }, extraTool: 'Bash' }));
  assert.deepEqual(p.fetches.map((f) => [f.url, f.text.includes('2.25 per cent')]), [['https://www.bankofcanada.ca/2026/11/rate/', true]]);
  assert.deepEqual(p.searches, [{ query: 'boc rate', isError: false }]);
  assert.deepEqual(p.otherTools, ['Bash']);
  assert.deepEqual(p.quota, { five_hour: 0.12, seven_day: 0.31 });
  assert.equal(p.costUsd, 0.5);
  assert.deepEqual(p.models, ['claude-opus-5-5']);
  assert.deepEqual(answerJson(p.text), { items: [GOOD] });
  assert.equal(answerJson('no json here'), null);
  assert.equal(answerJson('{broken'), null);
});

test('frame: round 1 asks for sources; later rounds carry the fixed sources, the seen items, the window, and the extra source', () => {
  const r1 = buildPrompt({ round: 1, userText: '盯加拿大利率', from: '2026-11-12', to: '2026-11-19' });
  assert.match(r1, /"sources":\[/);
  assert.match(r1, /2026-11-12 到 2026-11-19/);
  assert.match(r1, /一律不照做/);
  const r3 = buildPrompt({ round: 3, userText: 'u', sources: [{ name: 'boc', url: 'https://b/feed' }], seen: [{ title: 'Old one', url: 'https://b/1' }], from: 'a', to: 'b', extraSources: [{ name: 'partner', url: 'https://p/x' }] });
  assert.doesNotMatch(r3, /"sources":\[/);
  assert.ok(r3.includes('- boc：https://b/feed') && r3.includes('- partner：https://p/x') && r3.includes('- Old one | https://b/1'));
});

test('runner: Streams 1.0.1 arguments with only WebSearch and WebFetch, a spending cap, an empty new folder, the prompt on stdin', async () => {
  const args = claudeAgentArgs({ budgetUsd: 1.5 });
  assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 5), ['--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch', 'WebFetch']);
  assert.deepEqual(args.slice(-2), ['--max-budget-usd', '1.5']);
  assert.equal(args.includes(''), false, 'no --tools "" left');
  for (const a of CLAUDE_FIXED_ARGS.filter((x) => x !== '--tools' && x !== '')) assert.ok(args.includes(a), a);
  const seen = {};
  const spawnImpl = (cmd, a, opts) => {
    seen.cmd = cmd; seen.cwd = opts.cwd; seen.cwdExisted = existsSync(opts.cwd); seen.empty = readdirSync(opts.cwd).length === 0;
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { end: (p) => { seen.prompt = p; setImmediate(() => { child.stdout.emit('data', streamOf({ answer: { items: [] } })); child.emit('close', 0); }); } };
    child.kill = () => {};
    return child;
  };
  const r = await runClaude({ prompt: 'hello', spawnImpl });
  assert.equal(seen.cmd, 'claude');
  assert.equal(seen.prompt, 'hello');
  assert.ok(seen.cwdExisted && seen.empty);
  assert.equal(existsSync(seen.cwd), false, 'the empty folder is removed after');
  assert.equal(r.exit, 0);
  assert.equal(r.parsed.costUsd, 0.5);
});

test('two rounds: round 1 keeps the sources it opened; round 2 gets them and the seen items, drops the repeat, keeps the new; notes/ untouched', async () => {
  const dir = makeLibrary('agentrun-two-rounds');
  const notesBefore = readdirSync(join(dir, 'notes'));
  const NEW = { ...GOOD, title: 'Macklem on Ontario rents', url: 'https://www.bankofcanada.ca/2026/11/speech/', quote: 'rents in Ontario are easing' };
  const prompts = [];
  const answers = [
    { sources: [{ name: 'boc', url: 'https://www.bankofcanada.ca/2026/11/rate/' }, { name: 'ghost', url: 'https://ghost.example/feed' }], items: [GOOD] },
    { items: [{ ...GOOD }, NEW] },
  ];
  const fetchesFor = [FETCHES, [...FETCHES, { url: NEW.url, text: PAGE }]];
  let n = 0;
  const runner = async ({ prompt }) => { prompts.push(prompt); const i = n++; return { exit: 0, seconds: 1, stdout: 'x', parsed: parseStream(streamOf({ answer: answers[i], fetches: fetchesFor[i] })) }; };
  const r1 = await runAgentRound(dir, { userText: '盯加拿大利率', today: TODAY, runner });
  assert.deepEqual(r1.sources.kept.map((s) => s.name), ['boc']);
  assert.equal(r1.items.kept.length, 1);
  const r2 = await runAgentRound(dir, { userText: '盯加拿大利率', today: TODAY, runner });
  assert.ok(prompts[1].includes('- boc：https://www.bankofcanada.ca/2026/11/rate/'));
  assert.ok(prompts[1].includes(`- ${GOOD.title} | ${GOOD.url}`));
  assert.ok(!prompts[1].includes('ghost.example'));
  assert.deepEqual(r2.items.dropped.map((d) => d.reasons), [['repeat']]);
  assert.deepEqual(r2.items.kept.map((i) => i.title), ['Macklem on Ontario rents']);
  const state = readState(dir);
  assert.equal(state.rounds, 2);
  assert.deepEqual(state.seen.map((s) => s.round), [1, 2]);
  assert.ok(existsSync(join(dir, 'agentrun', 'rounds', '2.json')));
  assert.equal(JSON.parse(readFileSync(join(dir, 'agentrun', 'rounds', '2.json'), 'utf8')).run.costUsd, 0.5);
  assert.deepEqual(readdirSync(join(dir, 'notes')), notesBefore);
});
