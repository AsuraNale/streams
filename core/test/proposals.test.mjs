// Proposal cards (v2 package B; src/proposals/; docs/core-api.md 5.13): the ten kinds — good params make a pending card whose
// before / after the code worked out from the library (what the issuer says they are is ignored), a confirm changes the
// library as the kind's table says (read back from streams.json), and decline / revise / a stale card / a second confirm
// leave every byte of the library as it was (N1: only a pending card's confirm changes anything). create_library: the
// default place, a folder that is not empty refused, a refused source unticked, the steps through the caller's hooks, a
// step that fails undone. The record (proposals.jsonl) and 「谁定的」 (changes.jsonl). Each rule first gets the input made
// to break it. No network: every source is on a local fake server.
// redesign R6b-1: the text typed for 提出修改 in the N1 test is 「请改用其他来源」 — it used to be a fragment of the v1 处理建议, which the
// contract wants gone from the repository; it is only a sample of what a user types, the checks are the same.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLibrary } from '../src/library/create.mjs';
import { pipelineConfig } from '../src/pipeline/config.mjs';
import { readBrief, saveBrief } from '../src/library/brief.mjs';
import { addSource, updateSource, updateTopic } from '../src/library/sources.mjs';
import { saveLibrarySchedule } from '../src/library/schedule.mjs';
import {
  PROPOSAL_KINDS, appendProposal, confirmProposal, declineProposal, draftProposal, libraryFolderName, readChanges, readProposals,
  recordChange, reviseProposal, whoDecided,
} from '../src/proposals/index.mjs';
import * as core from '../src/index.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { rssWith } from './support/feeds.mjs';
import { hashTree } from './support/pipeline.mjs';
import { caseDir } from './support/tmp.mjs';

const CLOCK = new Date(Date.UTC(2026, 10, 5, 15, 0, 0));
const now = () => CLOCK;
const srv = await startFakeServer();
after(() => srv.close());
const FEED_OK = srv.route('/ok', { body: rssWith([{ title: 'One about agent memory', url: 'https://x.test/1' }, { title: 'Two', url: 'https://x.test/2' }]) });
const FEED_BLOCKED = srv.route('/blocked', { status: 403, body: 'no' });
const FEED_GONE = srv.route('/gone', { status: 404, body: 'none' });
const fetchCtx = { timeoutMs: 1500, sleep: async () => {} };

// a library in createLibrary's format with one topic, two sources and a key the core never reads (every write keeps it)
function library(name) {
  const dir = caseDir(`proposals-${name}`);
  createLibrary(dir, { name });
  const path = join(dir, 'streams.json');
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  cfg.topics = [{ name: 'agent 记忆', keywords: ['agent memory', 'long-term memory'] }, { name: '评测', keywords: ['benchmark'] }];
  cfg.sources = [{ name: 'feed-a', kind: 'rss', url: FEED_OK, topic: 'agent 记忆' }, { name: 'hn-agents', kind: 'hn', query: 'agent', topic: '评测' }];
  cfg.x_future = { keep: ['me', 1] };
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return dir;
}
const config = (dir) => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'));
const tree = (dir) => hashTree(dir);
const draft = (kind, params, dir, extra = {}) => draftProposal({ kind, params, why: '因为你说过想追这个', by: 'agent', ...extra }, { libraryDir: dir, ctx: fetchCtx, now });
const refused = (code, reason) => (err) => err?.code === code && (reason === undefined || err.reason === reason);

// one good card per library kind: its params, and what the library holds after the confirm
const GOOD = {
  add_source: { params: { source: { name: 'feed-b', kind: 'rss', url: FEED_OK, topic: '评测' } }, check: (c) => assert.deepEqual(c.sources.map((s) => s.name), ['feed-a', 'hn-agents', 'feed-b']) },
  remove_source: { params: { name: 'hn-agents' }, check: (c) => assert.deepEqual(c.sources.map((s) => s.name), ['feed-a']) },
  pause_source: { params: { name: 'feed-a', paused: true }, check: (c) => assert.equal(c.sources[0].paused, true) },
  edit_topics: {
    params: { ops: [{ op: 'add_topic', name: 'RAG', keywords: ['retrieval'] }, { op: 'add_keywords', topic: 'agent 记忆', keywords: ['memory blocks'] }, { op: 'remove_keywords', topic: 'agent 记忆', keywords: ['long-term memory'] }, { op: 'remove_topic', name: '评测' }] },
    check: (c) => {
      assert.deepEqual(c.topics, [{ name: 'agent 记忆', keywords: ['agent memory', 'memory blocks'] }, { name: 'RAG', keywords: ['retrieval'] }]);
      assert.equal(c.sources.find((s) => s.name === 'hn-agents').topic, undefined, 'removeTopic cleared the source that used it');
    },
  },
  edit_brief: { params: { brief: '  只要讲 agent 长期记忆的工程实践，不要营销稿。 ' }, check: (c) => assert.equal(c.brief, '只要讲 agent 长期记忆的工程实践，不要营销稿。') },
  edit_thresholds: { params: { relevance: 0.55, substance: 0.8 }, check: (c) => assert.deepEqual(c.pipeline.nodes.filter((n) => n.kind === 'gate').map((n) => [n.id, n.threshold]), [['relevance', 0.55], ['substance', 0.8]]) },
  edit_schedule: { params: { enabled: false, time: '21:15' }, check: (c) => assert.deepEqual(c.schedule, { enabled: false, time: '21:15' }) },
  edit_cap: { params: { cap: 40 }, check: (c) => assert.equal(c.pipeline.cap, 40) },
};

test('the kinds: ten, each in the core surface', () => {
  assert.deepEqual([...PROPOSAL_KINDS].sort(), ['add_source', 'create_library', 'edit_brief', 'edit_cap', 'edit_schedule', 'edit_thresholds', 'edit_topics', 'pause_source', 'remove_source', 'run_round']);
  for (const n of ['draftProposal', 'confirmProposal', 'declineProposal', 'reviseProposal', 'readProposals', 'appendProposal', 'whoDecided', 'recordChange', 'saveBrief', 'readBrief']) assert.equal(typeof core[n], 'function', n);
});

for (const [kind, spec] of Object.entries(GOOD)) {
  test(`${kind}: a card from good params, confirmed → the library changed as the table says; the other keys kept`, async () => {
    const dir = library(`${kind}-ok`);
    const before = config(dir);
    const card = await draft(kind, { libraryId: 'lib00001', ...spec.params }, dir);
    assert.equal(card.status, 'pending');
    assert.equal(card.kind, kind);
    assert.equal(card.libraryId, 'lib00001');
    assert.equal(card.by, 'agent');
    assert.match(card.baseHash, /^[0-9a-f]{16}$/);
    assert.notDeepEqual(card.before, card.after, 'the card shows a change');
    assert.deepEqual(config(dir), before, 'making the card wrote nothing');
    const done = confirmProposal(card, { libraryDir: dir, now });
    assert.equal(done.status, 'confirmed', JSON.stringify(done.failure ?? done.reason));
    assert.equal(done.decidedAt, CLOCK.toISOString());
    const c = config(dir);
    spec.check(c);
    assert.deepEqual(c.x_future, { keep: ['me', 1] }, 'a key the core never reads kept');
    assert.ok(!readdirSync(dir).some((f) => f.endsWith('.tmp')), 'no temporary file left');
    // 「谁定的」: every field that changed, by agent-confirmed with the card's id
    const lines = readChanges(dir).entries;
    assert.ok(lines.length >= 1);
    for (const l of lines) assert.deepEqual([l.by, l.proposalId], ['agent-confirmed', card.id]);
    assert.deepEqual(done.result.changed, lines.map((l) => l.field));
  });
}

test('run_round: a card (before = the last round and the cap), confirmed → the hook queues it; nothing of the library written', async () => {
  const dir = library('run-round');
  const card = await draft('run_round', { libraryId: 'lib00001' }, dir);
  assert.deepEqual(card.before, { lastRoundAt: null, cap: 120 });
  const t = tree(dir);
  const queued = [];
  const done = confirmProposal(card, { libraryDir: dir, now, hooks: { enqueue: (id) => { queued.push(id); return { queued: true }; } } });
  assert.equal(done.status, 'confirmed');
  assert.deepEqual(queued, ['lib00001']);
  assert.deepEqual(tree(dir), t);
  // control: a hook that throws is a failed card, nothing queued twice
  const card2 = await draft('run_round', { libraryId: 'lib00001' }, dir);
  const f = confirmProposal(card2, { libraryDir: dir, now, hooks: { enqueue: () => { throw new Error('queue broke'); } } });
  assert.equal(f.status, 'failed');
  assert.equal(f.failure.step, 'queue');
});

test('bad params are refused (bad-proposal) kind by kind; a change that changes nothing too; nothing written', async () => {
  const dir = library('bad');
  const t = tree(dir);
  const cases = [
    ['nope', { libraryId: 'a' }],
    ['add_source', { libraryId: 'a' }],
    ['add_source', { libraryId: 'a', source: { name: 'Bad Name', kind: 'rss', url: FEED_OK } }],
    ['add_source', { libraryId: 'a', source: { name: 'feed-a', kind: 'rss', url: FEED_OK } }], // a duplicate
    ['add_source', { libraryId: 'a', source: { name: 'x', kind: 'rss', url: FEED_OK, topic: '没有这个主题' } }],
    ['add_source', { source: { name: 'x', kind: 'rss', url: FEED_OK } }], // no libraryId
    ['remove_source', { libraryId: 'a', name: 'not-there' }],
    ['remove_source', { libraryId: 'a', name: 'feed-a', extra: 1 }],
    ['pause_source', { libraryId: 'a', name: 'feed-a', paused: 'yes' }],
    ['pause_source', { libraryId: 'a', name: 'feed-a', paused: false }], // already not paused: no change
    ['edit_topics', { libraryId: 'a', ops: [] }],
    ['edit_topics', { libraryId: 'a', ops: [{ op: 'rename', name: 'x' }] }],
    ['edit_topics', { libraryId: 'a', ops: [{ op: 'add_topic', name: '评测' }] }], // a duplicate
    ['edit_topics', { libraryId: 'a', ops: [{ op: 'remove_topic', name: '没有' }] }],
    ['edit_topics', { libraryId: 'a', ops: [{ op: 'add_keywords', topic: '评测', keywords: [] }] }],
    ['edit_topics', { libraryId: 'a', ops: [{ op: 'remove_keywords', topic: '评测', keywords: ['not a keyword'] }] }],
    ['edit_brief', { libraryId: 'a', brief: '   ' }],
    ['edit_brief', { libraryId: 'a', brief: '长'.repeat(2001) }],
    ['edit_thresholds', { libraryId: 'a' }],
    ['edit_thresholds', { libraryId: 'a', relevance: 1.2 }],
    ['edit_thresholds', { libraryId: 'a', relevance: 0.7 }], // the default already: no change
    ['edit_schedule', { libraryId: 'a', time: '24:00' }],
    ['edit_schedule', { libraryId: 'a', enabled: 'on' }],
    ['edit_cap', { libraryId: 'a', cap: 0 }],
    ['edit_cap', { libraryId: 'a', cap: 2.5 }],
    ['edit_cap', { libraryId: 'a', cap: 120 }], // the default already
    ['run_round', { libraryId: 'a', now: true }],
  ];
  for (const [kind, params] of cases) await assert.rejects(draft(kind, params, dir), refused('bad-proposal'), `${kind} ${JSON.stringify(params)}`);
  // a missing why, an unknown by, a library with no readable streams.json
  await assert.rejects(draftProposal({ kind: 'edit_cap', params: { libraryId: 'a', cap: 5 } }, { libraryDir: dir, now }), refused('bad-proposal'));
  await assert.rejects(draft('edit_cap', { libraryId: 'a', cap: 5 }, dir, { by: 'someone' }), refused('bad-proposal'));
  await assert.rejects(draft('edit_cap', { libraryId: 'a', cap: 5 }, join(dir, 'nothing-here')), refused('bad-proposal', 'no-library'));
  assert.deepEqual(tree(dir), t, 'not one byte written');
  // control: the same kinds with good params pass
  assert.equal((await draft('edit_cap', { libraryId: 'a', cap: 5 }, dir)).status, 'pending');
});

test('before / after are the code\'s: what the issuer says they are (beside params or inside them) is ignored', async () => {
  const dir = library('forged');
  const forged = { sources: { count: 99, names: ['made-up'] } };
  const card = await draftProposal({
    kind: 'add_source', why: 'w', by: 'agent', before: forged, after: forged, trial: { status: 'ok', count: 50 }, baseHash: 'f'.repeat(16), status: 'confirmed',
    params: { libraryId: 'a', before: forged, after: forged, trial: { status: 'ok' }, baseHash: '0'.repeat(16), source: { name: 'feed-b', kind: 'rss', url: FEED_BLOCKED } },
  }, { libraryDir: dir, ctx: fetchCtx, now });
  assert.deepEqual(card.before, { sources: { count: 2, names: ['feed-a', 'hn-agents'], paused: [] } });
  assert.deepEqual(card.after, { sources: { count: 3, names: ['feed-a', 'hn-agents', 'feed-b'], paused: [] } });
  assert.equal(card.status, 'pending');
  assert.notEqual(card.baseHash, 'f'.repeat(16));
  assert.equal(card.trial.status, 'blocked', 'the trial is the code\'s own fetch (the server answers 403)');
  assert.equal(card.trial.include, false);
  assert.deepEqual(Object.keys(card.params).sort(), ['libraryId', 'source']);
});

test('add_source: the code tries the source once (v1.0\'s fetchSource) and writes the result on the card; nothing written', async () => {
  const dir = library('trial');
  const t = tree(dir);
  const hits = srv.hits('/ok');
  const card = await draft('add_source', { libraryId: 'a', source: { name: 'feed-b', kind: 'rss', url: FEED_OK } }, dir);
  assert.equal(srv.hits('/ok'), hits + 1, 'one fetch');
  assert.equal(card.trial.status, 'ok');
  assert.equal(card.trial.count, 2);
  assert.deepEqual(card.trial.sample.map((s) => s.title), ['One about agent memory', 'Two']);
  assert.deepEqual(tree(dir), t);
  const gone = await draft('add_source', { libraryId: 'a', source: { name: 'feed-c', kind: 'rss', url: FEED_GONE } }, dir);
  assert.deepEqual([gone.trial.status, gone.trial.include], ['gap', false]);
});

test('N1: only a pending card\'s confirm changes anything — decline, revise, a second confirm, a confirm after decline leave every byte', async () => {
  for (const [kind, spec] of Object.entries(GOOD)) {
    const dir = library(`n1-${kind}`);
    const card = await draft(kind, { libraryId: 'a', ...spec.params }, dir);
    const t = tree(dir);
    const declined = declineProposal(card, { now });
    assert.equal(declined.status, 'declined');
    assert.deepEqual(tree(dir), t, `${kind}: decline wrote nothing`);
    const revised = reviseProposal(card, '请改用其他来源', { now });
    assert.deepEqual([revised.status, revised.reviseText], ['revise', '请改用其他来源']);
    assert.deepEqual(tree(dir), t, `${kind}: revise wrote nothing`);
    for (const c of [declined, revised]) {
      assert.throws(() => confirmProposal(c, { libraryDir: dir, now }), refused('not-pending'), `${kind}: ${c.status} then confirm`);
      assert.throws(() => declineProposal(c, { now }), refused('not-pending'));
      assert.throws(() => reviseProposal(c, 'x', { now }), refused('not-pending'));
    }
    assert.deepEqual(tree(dir), t, `${kind}: refused confirms wrote nothing`);
    // control: the same card confirmed does change the library; confirmed once, never again
    const done = confirmProposal(card, { libraryDir: dir, now });
    assert.equal(done.status, 'confirmed');
    const t2 = tree(dir);
    assert.notDeepEqual(t2, t, `${kind}: the confirm changed the library`);
    assert.throws(() => confirmProposal(done, { libraryDir: dir, now }), refused('not-pending'), `${kind}: a second confirm`);
    assert.deepEqual(tree(dir), t2, `${kind}: the second confirm wrote nothing (changes.jsonl included)`);
  }
});

test('stale: the configuration the card is about changed after it was made → confirm refuses (stale), the library as it is now', async () => {
  const dir = library('stale');
  const brief = await draft('edit_brief', { libraryId: 'a', brief: '新的要求' }, dir);
  const source = await draft('add_source', { libraryId: 'a', source: { name: 'feed-b', kind: 'rss', url: FEED_OK } }, dir);
  const cap = await draft('edit_cap', { libraryId: 'a', cap: 30 }, dir);
  // by hand, after the cards: the brief, a source, the schedule (not what the cap card is about). 1.0.1 (F1): a source card is
  // about its one source, so the source added by hand is the one the card adds (it was another one before 1.0.1)
  saveBrief(dir, '我自己改的要求');
  addSource(dir, { name: 'feed-b', kind: 'hn', query: 'rag' });
  saveLibrarySchedule(dir, { enabled: false, time: '06:00' });
  const t = tree(dir);
  for (const c of [brief, source]) {
    const r = confirmProposal(c, { libraryDir: dir, now });
    assert.deepEqual([r.status, r.reason], ['stale', 'changed'], c.kind);
  }
  assert.deepEqual(tree(dir), t, 'the stale cards changed nothing');
  assert.equal(readBrief(dir), '我自己改的要求');
  // control: a card about another part of the configuration still goes through
  assert.equal(confirmProposal(cap, { libraryDir: dir, now }).status, 'confirmed');
  assert.equal(pipelineConfig(dir).cap, 30);
  // a topic's keywords changed by hand: the edit_topics card made before is stale
  const topics = await draft('edit_topics', { libraryId: 'a', ops: [{ op: 'add_keywords', topic: '评测', keywords: ['eval'] }] }, dir);
  updateTopic(dir, '评测', { keywords: ['benchmark', 'leaderboard'] });
  assert.equal(confirmProposal(topics, { libraryDir: dir, now }).status, 'stale');
  // the library gone: stale too
  const gone = await draft('edit_cap', { libraryId: 'a', cap: 31 }, dir);
  assert.deepEqual(confirmProposal(gone, { libraryDir: join(dir, 'not-here'), now }).reason, 'library-gone');
});

test('UC3: an add_source and an edit_topics card of one turn — either confirmed first, the other still goes through (baseHash = only what the card changes)', async () => {
  assert.deepEqual(core.HASH_FIELDS.add_source, ['sources'], 'a source card hashes the sources only');
  assert.deepEqual(core.HASH_FIELDS.edit_topics, ['topics'], 'a topics card hashes the topics only');
  for (const order of [['add_source', 'edit_topics'], ['edit_topics', 'add_source']]) {
    const dir = library(`uc3-${order[0]}`);
    const cards = {
      add_source: await draft('add_source', { libraryId: 'a', source: { name: 'feed-b', kind: 'rss', url: FEED_OK, topic: '评测' } }, dir),
      edit_topics: await draft('edit_topics', { libraryId: 'a', ops: [{ op: 'add_keywords', topic: '评测', keywords: ['公告'] }] }, dir),
    };
    for (const kind of order) {
      const r = confirmProposal(cards[kind], { libraryDir: dir, now });
      assert.equal(r.status, 'confirmed', `${order.join(' then ')}: ${kind} ${r.reason ?? ''}`);
    }
    const c = config(dir);
    assert.deepEqual(c.sources.map((s) => s.name), ['feed-a', 'hn-agents', 'feed-b']);
    assert.deepEqual(c.topics.find((x) => x.name === '评测').keywords, ['benchmark', '公告']);
    assert.deepEqual(whoDecided(dir).sources.by, 'agent-confirmed');
    assert.deepEqual(whoDecided(dir).topics.by, 'agent-confirmed');
  }
});

test('the other way: the part a card changes changed by hand after it was made → stale, nothing written (each library kind)', async () => {
  const dir = library('own-part');
  const cards = {
    add_source: await draft('add_source', { libraryId: 'a', source: { name: 'feed-b', kind: 'rss', url: FEED_OK } }, dir),
    remove_source: await draft('remove_source', { libraryId: 'a', name: 'hn-agents' }, dir),
    pause_source: await draft('pause_source', { libraryId: 'a', name: 'feed-a', paused: true }, dir),
    edit_topics: await draft('edit_topics', { libraryId: 'a', ops: [{ op: 'add_keywords', topic: '评测', keywords: ['eval'] }] }, dir),
    edit_brief: await draft('edit_brief', { libraryId: 'a', brief: '新的要求' }, dir),
    edit_thresholds: await draft('edit_thresholds', { libraryId: 'a', relevance: 0.5 }, dir),
    edit_schedule: await draft('edit_schedule', { libraryId: 'a', time: '07:45' }, dir),
    edit_cap: await draft('edit_cap', { libraryId: 'a', cap: 30 }, dir),
  };
  // by hand, after the cards: each source card's own source (1.0.1, F1: a source card is about its one source — before 1.0.1
  // another source added by hand was enough), a keyword, the brief, the lines, the time, the cap
  addSource(dir, { name: 'feed-b', kind: 'hn', query: 'rag' });
  updateSource(dir, 'hn-agents', { query: 'agents' });
  updateSource(dir, 'feed-a', { url: `${FEED_OK}?moved` });
  updateTopic(dir, '评测', { keywords: ['benchmark', 'leaderboard'] });
  saveBrief(dir, '我自己改的要求');
  core.savePipelineConfig(dir, (() => { const p = pipelineConfig(dir); return { ...p, cap: 77, nodes: p.nodes.map((n) => (n.id === 'relevance' ? { ...n, threshold: 0.65 } : n)) }; })());
  saveLibrarySchedule(dir, { enabled: false, time: '06:00' });
  const t = tree(dir);
  for (const [kind, c] of Object.entries(cards)) {
    const r = confirmProposal(c, { libraryDir: dir, now });
    assert.deepEqual([r.status, r.reason], ['stale', 'changed'], kind);
  }
  assert.deepEqual(tree(dir), t, 'nothing written');
  // control: the same cards made now go through (stale above is about the part, not about the cards)
  assert.equal(confirmProposal(await draft('edit_cap', { libraryId: 'a', cap: 30 }, dir), { libraryDir: dir, now }).status, 'confirmed');
  assert.equal(confirmProposal(await draft('add_source', { libraryId: 'a', source: { name: 'feed-c', kind: 'rss', url: FEED_OK } }, dir), { libraryDir: dir, now }).status, 'confirmed');
});

test('a step that fails is undone: streams.json byte for byte as it was, the card failed and says at which step', async () => {
  const dir = library('rollback');
  const card = await draft('edit_topics', { libraryId: 'a', ops: [{ op: 'add_topic', name: 'RAG' }, { op: 'add_keywords', topic: '评测', keywords: ['eval'] }, { op: 'remove_topic', name: 'agent 记忆' }] }, dir);
  const t = tree(dir);
  const r = confirmProposal(card, { libraryDir: dir, now, onStep: (s) => { if (s === 'op:3') throw new Error('disk full'); } });
  assert.equal(r.status, 'failed');
  assert.deepEqual([r.failure.step, r.failure.done, r.failure.rolledBack], ['op:3', ['op:1', 'op:2'], true]);
  assert.deepEqual(tree(dir), t, 'ops 1 and 2 undone, nothing in changes.jsonl');
  assert.throws(() => confirmProposal(r, { libraryDir: dir, now }), refused('not-pending'), 'a failed card is not confirmed again');
});

// ---------------------------------------------------------------- create_library

function hooksRecorder({ failRegister = false, failQueue = false } = {}) {
  const calls = [];
  return {
    calls,
    hooks: {
      register: (folder, { name }) => { calls.push(['register', folder, name]); if (failRegister) throw new Error('registry not writable'); return { libraryId: 'new00001' }; },
      unregister: (id) => { calls.push(['unregister', id]); },
      enqueue: (id) => { calls.push(['enqueue', id]); if (failQueue) throw new Error('queue broke'); return { queued: true }; },
    },
  };
}
const NEW = (extra = {}) => ({
  name: 'AI 工具: 记忆/检索?', brief: '追 agent 记忆与检索的工程实践', topics: [{ name: 'agent 记忆', keywords: ['agent memory'] }],
  sources: [
    { name: 'feed-ok', kind: 'rss', url: FEED_OK, topic: 'agent 记忆' },
    { name: 'feed-blocked', kind: 'rss', url: FEED_BLOCKED },
    { name: 'feed-gone', kind: 'rss', url: FEED_GONE, include: true },
  ],
  thresholds: { relevance: 0.65 }, schedule: { enabled: true, time: '07:30' }, ...extra,
});
const createCard = (root, params = NEW(), o = {}) => draftProposal({ kind: 'create_library', params, why: '你说想追 agent 记忆' }, { libraryRoot: root, fallbackSchedule: { enabled: false, time: '09:00' }, ctx: fetchCtx, now, ...o });

test('libraryFolderName: the characters a folder name cannot have become -, never empty or a reserved name', () => {
  assert.equal(libraryFolderName('AI 工具: 记忆/检索?'), 'AI 工具- 记忆-检索-');
  assert.equal(libraryFolderName('  a.  '), 'a');
  assert.equal(libraryFolderName('CON'), 'CON-');
  assert.equal(libraryFolderName('<>'), '--');
  assert.equal(libraryFolderName('   '), 'library');
});

test('create_library: the default place is libraryRoot\\<name as a folder name>, written on the card; each source tried, the refused ones unticked', async () => {
  const root = caseDir('proposals-create-default');
  const card = await createCard(root);
  assert.equal(card.libraryId, null);
  assert.equal(card.params.folder, join(root, 'AI 工具- 记忆-检索-'));
  assert.equal(card.after.folder, card.params.folder);
  assert.deepEqual(card.before, { folder: card.params.folder, state: 'absent' });
  assert.deepEqual(card.trial.map((t) => [t.name, t.status, t.include]), [['feed-ok', 'ok', true], ['feed-blocked', 'blocked', false], ['feed-gone', 'gap', false]], 'include: true from the issuer is not taken');
  assert.deepEqual(card.after.sources.names, ['feed-ok'], 'after: only the ticked sources');
  assert.deepEqual(card.after.schedule, { enabled: true, time: '07:30' });
  assert.equal(card.after.thresholds.relevance, 0.65);
  assert.deepEqual(readdirSync(root), [], 'making the card made no folder');
  // no schedule on the card: the caller's fallback (what a new library gets)
  const c2 = await createCard(root, NEW({ schedule: null, name: 'b' }));
  assert.deepEqual(c2.params.schedule, { enabled: false, time: '09:00' });
  // a folder given: that one
  const own = join(caseDir('proposals-create-own'), 'here');
  assert.equal((await createCard(root, NEW({ folder: own }))).params.folder, own);
});

test('create_library: a folder that is there and not empty is refused (folder_not_empty) when the card is made, and stale at the confirm', async () => {
  const root = caseDir('proposals-create-busy');
  mkdirSync(join(root, 'busy'));
  writeFileSync(join(root, 'busy', 'mine.txt'), 'the user\'s');
  await assert.rejects(createCard(root, NEW({ name: 'busy' })), refused('bad-proposal', 'folder_not_empty'));
  // an empty folder is fine
  mkdirSync(join(root, 'empty'));
  const card = await createCard(root, NEW({ name: 'empty' }));
  assert.equal(card.before.state, 'empty');
  // something put in it after the card was made: stale, the file untouched, no hook called
  writeFileSync(join(root, 'empty', 'late.txt'), 'later');
  const rec = hooksRecorder();
  const r = confirmProposal(card, { hooks: rec.hooks, now });
  assert.deepEqual([r.status, r.reason], ['stale', 'folder_not_empty']);
  assert.deepEqual(readdirSync(join(root, 'empty')), ['late.txt']);
  assert.deepEqual(rec.calls, []);
});

test('create_library confirmed: made, brief / topics / ticked sources / thresholds / schedule written, registered, its first round queued; 「谁定的」 agent-confirmed', async () => {
  const root = caseDir('proposals-create-ok');
  const card = await createCard(root);
  const rec = hooksRecorder();
  const r = confirmProposal(card, { hooks: rec.hooks, now, language: 'en' });
  assert.equal(r.status, 'confirmed', JSON.stringify(r.failure));
  const dir = card.params.folder;
  assert.deepEqual(rec.calls, [['register', dir, 'AI 工具: 记忆/检索?'], ['enqueue', 'new00001']]);
  assert.deepEqual(r.result, { libraryId: 'new00001', folder: dir, queued: true });
  const c = config(dir);
  assert.equal(c.name, 'AI 工具: 记忆/检索?');
  assert.equal(c.brief, '追 agent 记忆与检索的工程实践');
  assert.deepEqual(c.topics, [{ name: 'agent 记忆', keywords: ['agent memory'] }]);
  assert.deepEqual(c.sources.map((s) => s.name), ['feed-ok'], 'the unticked ones are not added');
  assert.equal(c.pipeline.nodes.find((n) => n.id === 'relevance').threshold, 0.65);
  assert.equal(c.pipeline.language, 'en');
  assert.deepEqual(c.schedule, { enabled: true, time: '07:30' });
  const who = whoDecided(dir);
  for (const f of ['brief', 'topics', 'sources', 'thresholds', 'schedule']) assert.deepEqual([who[f]?.by, who[f]?.proposalId], ['agent-confirmed', card.id], f);
  assert.equal(who.cap, null, 'the card did not decide the cap');
});

test('create_library: a step that fails before the registration ends is undone — no half library left, the card says the step', async () => {
  for (const at of ['create', 'brief', 'topics', 'sources', 'thresholds', 'schedule', 'register']) {
    const root = caseDir(`proposals-create-fail-${at}`);
    const card = await createCard(root);
    const rec = hooksRecorder();
    const r = confirmProposal(card, { hooks: rec.hooks, now, onStep: (s) => { if (s === at) throw new Error(`failed at ${s}`); } });
    assert.equal(r.status, 'failed', at);
    assert.deepEqual([r.failure.step, r.failure.rolledBack], [at, true], at);
    assert.equal(existsSync(card.params.folder), false, `${at}: the folder made is gone again`);
    assert.ok(!rec.calls.some(([k]) => k === 'enqueue'), `${at}: nothing queued`);
  }
  // the registry refusing: the folder taken out again; a folder that was there and empty stays, empty
  const root = caseDir('proposals-create-fail-registry');
  mkdirSync(join(root, 'kept'));
  const card = await createCard(root, NEW({ name: 'kept' }));
  const rec = hooksRecorder({ failRegister: true });
  const r = confirmProposal(card, { hooks: rec.hooks, now });
  assert.deepEqual([r.status, r.failure.step, r.failure.done, r.failure.rolledBack], ['failed', 'register', ['create', 'brief', 'topics', 'sources', 'thresholds', 'schedule'], true]);
  assert.deepEqual(readdirSync(join(root, 'kept')), []);
});

test('create_library: the queue failing after the registration — the library stays (made, registered), the card says how far it got', async () => {
  const root = caseDir('proposals-create-fail-queue');
  const card = await createCard(root);
  const rec = hooksRecorder({ failQueue: true });
  const r = confirmProposal(card, { hooks: rec.hooks, now });
  assert.equal(r.status, 'failed');
  assert.deepEqual([r.failure.step, r.failure.rolledBack, r.failure.done.at(-1)], ['queue', false, 'register']);
  assert.deepEqual(r.result, { libraryId: 'new00001', folder: card.params.folder });
  assert.equal(config(card.params.folder).brief, '追 agent 记忆与检索的工程实践');
  assert.ok(!rec.calls.some(([k]) => k === 'unregister'));
});

// ---------------------------------------------------------------- the record

test('proposals.jsonl: append only, read back as the last line of each id (in the order the ids came), bad lines skipped', async () => {
  const dir = caseDir('proposals-record');
  const file = join(dir, 'proposals.jsonl');
  assert.deepEqual(readProposals(file), { cards: [], skipped: 0 });
  const lib = library('record');
  const a = await draft('edit_cap', { libraryId: 'a', cap: 9 }, lib);
  const b = await draft('edit_brief', { libraryId: 'a', brief: 'x' }, lib);
  appendProposal(file, a);
  appendProposal(file, b);
  writeFileSync(file, readFileSync(file, 'utf8') + '{not json\n' + JSON.stringify({ id: 'p-x', kind: 'nope', status: 'pending', createdAt: 'x' }) + '\n\n');
  appendProposal(file, declineProposal(a, { now }));
  const text = readFileSync(file, 'utf8');
  const r = readProposals(file);
  assert.deepEqual(r.cards.map((c) => [c.id, c.status]), [[a.id, 'declined'], [b.id, 'pending']]);
  assert.equal(r.skipped, 2);
  appendProposal(file, b);
  assert.ok(readFileSync(file, 'utf8').startsWith(text), 'appended, nothing before rewritten');
});

test('「谁定的」: changes.jsonl by you / agent-confirmed, the last of each field wins, no record = null, bad lines skipped', async () => {
  const dir = library('who');
  // redesign R4b: two more fields are recorded (name: the library's name on 来源与要求; prompts: 评分环节's prompts, material, checks)
  assert.deepEqual(whoDecided(dir), { brief: null, sources: null, topics: null, thresholds: null, schedule: null, cap: null, name: null, prompts: null });
  recordChange(dir, { field: 'sources', by: 'you', before: [], after: [{ name: 'x' }] }, { now });
  const card = await draft('edit_brief', { libraryId: 'a', brief: 'agent 写的要求' }, dir);
  confirmProposal(card, { libraryDir: dir, now });
  writeFileSync(join(dir, '_pipeline', 'changes.jsonl'), readFileSync(join(dir, '_pipeline', 'changes.jsonl'), 'utf8') + 'garbage\n{"field":"cap","by":"robot","at":"x"}\n');
  const who = whoDecided(dir);
  assert.deepEqual(who.sources, { by: 'you', at: CLOCK.toISOString(), proposalId: null });
  assert.deepEqual(who.brief, { by: 'agent-confirmed', at: CLOCK.toISOString(), proposalId: card.id });
  assert.equal(who.cap, null, 'a line whose by is unknown is skipped');
  assert.equal(readChanges(dir).skipped, 2);
  // the user then changes the brief: you
  recordChange(dir, { field: 'brief', by: 'you', before: 'agent 写的要求', after: '我的' }, { now });
  assert.equal(whoDecided(dir).brief.by, 'you');
  assert.throws(() => recordChange(dir, { field: 'brief', by: 'agent-confirmed', before: null, after: 'x' }), refused('bad-change'), 'agent-confirmed names its card');
  assert.throws(() => recordChange(dir, { field: 'notes', by: 'you' }), refused('bad-change'));
});

test('saveBrief / readBrief: 1–2000 characters, trimmed, the whole streams.json written atomically with the other keys kept', () => {
  const dir = library('brief');
  assert.equal(readBrief(dir), null);
  const before = config(dir);
  assert.deepEqual(saveBrief(dir, '  要求 '), { brief: '要求' });
  assert.deepEqual(config(dir), { ...before, brief: '要求' });
  assert.throws(() => saveBrief(dir, ''), refused('bad-argument'));
  assert.throws(() => saveBrief(dir, 'x'.repeat(2001)), refused('bad-argument'));
  assert.equal(saveBrief(dir, '长'.repeat(2000)).brief.length, 2000);
});
