import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWikiLinks, resolveLinks } from '../src/library/links.mjs';

// 对照 test_pipeline.py::test_index ("wikilink outlink") and index_db.extract_outlinks:
// the toolkit collected [[Target]] deduped+sorted; here raw extraction keeps order,
// resolution (id first, then title) splits into links / links_unresolved, both sorted.

test('extractWikiLinks: target forms, trimming, dedup, order of first appearance', () => {
  const body = 'see [[beta]] and [[ gamma | shown ]] then [[delta#section]] and [[eps#sec|disp]] again [[beta]] and [[gamma]]';
  assert.deepEqual(extractWikiLinks(body), ['beta', 'gamma', 'delta', 'eps']);
});

test('extractWikiLinks: things that are not links', () => {
  assert.deepEqual(extractWikiLinks('[[]] [[ ]] [[a] [b]] [a](b.md) [[|only display]]'), []);
  assert.deepEqual(extractWikiLinks('no links here'), []);
  assert.throws(() => extractWikiLinks(null), TypeError);
});

test('resolveLinks: id match first, then title match; sorted and deduped', () => {
  const byId = new Map([['beta', 'beta'], ['alpha', 'alpha']]);
  const byTitle = new Map([['Gamma Title', 'gamma'], ['beta', 'should-not-win']]);
  const r = resolveLinks(['Gamma Title', 'beta', 'nope', 'beta', 'alpha', 'Nope'], { byId, byTitle });
  assert.deepEqual(r, { links: ['alpha', 'beta', 'gamma'], unresolved: ['Nope', 'nope'] });
});

test('resolveLinks: plain objects work as maps, prototype keys do not resolve', () => {
  const r = resolveLinks(['a', 'constructor', 'toString'], { byId: { a: 'a' }, byTitle: {} });
  assert.deepEqual(r, { links: ['a'], unresolved: ['constructor', 'toString'] });
  assert.deepEqual(resolveLinks(['x'], {}), { links: [], unresolved: ['x'] });
  assert.throws(() => resolveLinks('x', {}), TypeError);
});

test('sentinel: an unknown target never lands in links', () => {
  const r = resolveLinks(['ghost'], { byId: new Map([['real', 'real']]), byTitle: new Map() });
  assert.deepEqual(r.links, []);
  assert.deepEqual(r.unresolved, ['ghost']);
});
