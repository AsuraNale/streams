import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STARTER_PACKS, STARTER_PACK_IDS, BLANK_PACK_ID, starterPack, packView, listStarterPacks, applyStarterPack, applyStarterPackToLibrary } from '../src/library/starter-packs.mjs';
import { createLibrary } from '../src/library/create.mjs';
import { readConfig, topicNames } from '../src/library/config.mjs';
import { SOURCE_KINDS } from '../src/fetch/source.mjs';
import { pipelineConfig } from '../src/pipeline/config.mjs';
import { caseDir } from './support/tmp.mjs';

const PACK = 'ai-agent-tools';

test('every pack is well formed: ids unique, both languages, every source kind known, every source topic one of the pack\'s', () => {
  assert.ok(STARTER_PACKS.length >= 1);
  assert.deepEqual(STARTER_PACK_IDS, [BLANK_PACK_ID, ...STARTER_PACKS.map((p) => p.id)]);
  assert.equal(new Set(STARTER_PACK_IDS).size, STARTER_PACK_IDS.length);
  for (const pack of STARTER_PACKS) {
    for (const lang of ['zh-CN', 'en']) assert.equal(typeof pack.name[lang], 'string', `${pack.id}: name.${lang}`);
    assert.ok(pack.topics.length >= 1 && pack.sources.length >= 1);
    const topicIds = pack.topics.map((t) => t.id);
    assert.equal(new Set(topicIds).size, topicIds.length, `${pack.id}: topic ids unique`);
    for (const t of pack.topics) for (const lang of ['zh-CN', 'en']) assert.ok(t.name[lang]?.trim(), `${pack.id}/${t.id}: name.${lang}`);
    const names = pack.sources.map((s) => s.name);
    assert.equal(new Set(names).size, names.length, `${pack.id}: source names unique`);
    for (const s of pack.sources) {
      assert.ok(SOURCE_KINDS.includes(s.kind), `${s.name}: kind ${s.kind}`);
      assert.ok(topicIds.includes(s.topic), `${s.name}: topic ${s.topic}`);
      if (s.kind === 'rss') assert.match(s.url, /^https:\/\//, `${s.name}: url`);
      else assert.ok(typeof s.query === 'string' && s.query !== '', `${s.name}: query`);
    }
  }
  // the one pack the spec names, with its three topics
  const p = starterPack(PACK);
  assert.deepEqual(p.topics.map((t) => t.name['zh-CN']), ['agent 记忆', 'MCP 生态', '评测']);
  assert.deepEqual(p.topics.map((t) => t.name.en), ['agent memory', 'MCP ecosystem', 'evaluation']);
});

test('packView: names in one language; sources carry url (rss) or query (arxiv / hn) and the topic name', () => {
  const zh = packView(PACK, 'zh-CN');
  const en = packView(PACK, 'en');
  assert.equal(zh.name, 'AI Agent 工具');
  assert.equal(en.name, 'AI agent tools');
  assert.deepEqual(zh.topics, ['agent 记忆', 'MCP 生态', '评测']);
  assert.deepEqual(en.topics, ['agent memory', 'MCP ecosystem', 'evaluation']);
  assert.equal(zh.sources.length, starterPack(PACK).sources.length);
  for (const s of zh.sources) {
    assert.ok(zh.topics.includes(s.topic), `${s.name}: topic in the pack's topics`);
    if (s.kind === 'rss') assert.ok(s.url && s.query === undefined);
    else assert.ok(s.url === null && typeof s.query === 'string');
  }
  assert.deepEqual(en.sources.map((s) => s.topic).filter((t) => zh.topics.includes(t)), [], 'English view uses English topic names');
  assert.deepEqual(packView('blank', 'zh-CN'), { id: 'blank', name: '空白', topics: [], sources: [] });
  assert.deepEqual(packView('blank', 'en').topics, []);
  assert.equal(packView(PACK, 'xx').name, 'AI Agent 工具', 'an unknown language falls back to Chinese');
  assert.deepEqual(listStarterPacks('en').map((p) => p.id), [PACK]);
  assert.throws(() => packView('nope', 'en'), (e) => e.code === 'unknown-pack');
});

test('applyStarterPack is pure and replaces topics and sources; blank gives none; edits remove and add', () => {
  const config = { name: 'x', topics: [{ name: 'old' }], sources: [{ name: 'old-src', kind: 'rss', url: 'https://x/y' }], pipeline: { language: 'zh-CN' } };
  const before = JSON.stringify(config);
  const out = applyStarterPack(config, PACK);
  assert.equal(JSON.stringify(config), before, 'the input is untouched');
  assert.deepEqual(out.topics.map((t) => t.name), ['agent 记忆', 'MCP 生态', '评测']);
  assert.ok(out.topics.every((t) => Array.isArray(t.keywords)));
  assert.equal(out.sources.length, starterPack(PACK).sources.length);
  assert.ok(out.sources.every((s) => out.topics.some((t) => t.name === s.topic)), 'every source topic is a topic of the config');
  assert.equal(out.name, 'x');
  assert.deepEqual(out.pipeline, config.pipeline, 'other keys kept');
  // language follows the pipeline's language unless given
  assert.deepEqual(applyStarterPack({ ...config, pipeline: { language: 'en' } }, PACK).topics.map((t) => t.name), ['agent memory', 'MCP ecosystem', 'evaluation']);
  assert.deepEqual(applyStarterPack(config, PACK, undefined, { language: 'en' }).sources[0].topic, 'agent memory');
  // blank
  assert.deepEqual(applyStarterPack(config, 'blank'), { ...config, topics: [], sources: [] });
  // edits
  const edited = applyStarterPack(config, PACK, { removeSources: ['hn-mcp', 'not-there'], addRss: [{ name: 'simonw', url: 'https://simonwillison.net/atom/everything/' }, { name: '', url: 'https://example.org/feed' }] });
  assert.equal(edited.sources.some((s) => s.name === 'hn-mcp'), false);
  assert.deepEqual(edited.sources.slice(-2), [{ name: 'simonw', kind: 'rss', url: 'https://simonwillison.net/atom/everything/' }, { name: 'example.org', kind: 'rss', url: 'https://example.org/feed' }]);
  assert.deepEqual(applyStarterPack(config, 'blank', { addRss: [{ name: 'a', url: 'http://a/b' }] }).sources, [{ name: 'a', kind: 'rss', url: 'http://a/b' }]);
});

test('sentinel: refused inputs really are refused', () => {
  const config = { name: 'x', topics: [], sources: [] };
  assert.throws(() => applyStarterPack(config, 'made-up'), (e) => e.code === 'unknown-pack');
  assert.throws(() => applyStarterPack('not an object', PACK), (e) => e.code === 'bad-config');
  assert.throws(() => applyStarterPack(config, PACK, 'edits?'), (e) => e.code === 'bad-edits');
  assert.throws(() => applyStarterPack(config, PACK, { removeSources: 'hn-mcp' }), (e) => e.code === 'bad-edits');
  assert.throws(() => applyStarterPack(config, PACK, { removeSources: [1] }), (e) => e.code === 'bad-edits');
  assert.throws(() => applyStarterPack(config, PACK, { addRss: [{ name: 'x', url: 'ftp://x/y' }] }), (e) => e.code === 'bad-url');
  assert.throws(() => applyStarterPack(config, PACK, { addRss: [{ name: 'x', url: 'javascript:alert(1)' }] }), (e) => e.code === 'bad-url');
  assert.throws(() => applyStarterPack(config, PACK, { addRss: [{ name: 'x' }] }), (e) => e.code === 'bad-url');
  assert.throws(() => applyStarterPack(config, PACK, { addRss: ['https://x/y'] }), (e) => e.code === 'bad-edits');
  assert.throws(() => applyStarterPack(config, PACK, { addRss: [{ name: 'simonwillison', url: 'https://x/y' }] }), (e) => e.code === 'duplicate-source');
  assert.throws(() => applyStarterPack(config, 'blank', { addRss: [{ name: 'a', url: 'https://x/1' }, { name: 'a', url: 'https://x/2' }] }), (e) => e.code === 'duplicate-source');
});

test('applyStarterPackToLibrary writes streams.json and keeps name, pipeline and unknown keys; the result still reads', () => {
  const dir = caseDir('starter-pack-library');
  createLibrary(dir, { name: 'lib', language: 'en' });
  // an unknown key the page may add later (the setup record) must survive
  const path = join(dir, 'streams.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  raw.setup = { library: 'user' };
  writeFileSync(path, JSON.stringify(raw, null, 2) + '\n');
  const r = applyStarterPackToLibrary(dir, PACK, { removeSources: ['openai-news'] });
  assert.equal(r.config.sources.some((s) => s.name === 'openai-news'), false);
  const after = readConfig(dir);
  assert.equal(after.ok, true);
  assert.deepEqual(topicNames(after.config), ['agent memory', 'MCP ecosystem', 'evaluation'], 'English library, English topic names');
  assert.equal(after.config.name, 'lib');
  assert.deepEqual(after.config.setup, { library: 'user' });
  assert.deepEqual(after.config.pipeline, raw.pipeline, 'the pipeline block is byte-for-byte what was there');
  assert.equal(pipelineConfig(dir).language, 'en');
  assert.ok(readFileSync(path, 'utf8').endsWith('\n'));
  // a bad edit writes nothing
  const before = readFileSync(path, 'utf8');
  assert.throws(() => applyStarterPackToLibrary(dir, PACK, { addRss: [{ url: 'nope' }] }), (e) => e.code === 'bad-url');
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.throws(() => applyStarterPackToLibrary(caseDir('starter-pack-no-library'), PACK), (e) => e.code === 'config:missing');
});
