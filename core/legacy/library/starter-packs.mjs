// Starter packs for the first run (product spec A1 step 3): a named set of topics and sources a new library
// can begin with. 'blank' is the empty choice.
//
//   STARTER_PACKS                                    [{ id, name:{ 'zh-CN', en }, topics:[{ id, name:{…} }], sources:[…] }]
//   packView(packId, language)                       -> { id, name, topics:[name…], sources:[{ name, kind, url, query?, topic }] }
//   applyStarterPack(config, packId, edits, { language }) -> a new config (pure: nothing read or written)
//   applyStarterPackToLibrary(libraryDir, packId, edits)  -> { config }   writes streams.json, every other key kept
//
// edits = { removeSources:[name…], addRss:[{ name, url }] }. Topics and sources are replaced, not merged: the
// pack is applied once, on an empty library. Every pack source was fetched for real once, on 2026-11-03, when
// this file was written (core fetchSource; the ones that did not answer with `ok` are not here); the tests
// never touch the network.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../../src/errors.mjs';
import { CONFIG_FILE, readConfig } from '../../src/library/config.mjs';
import { isPlainObject } from '../../src/library/frontmatter.mjs';
import { SOURCE_KINDS } from '../fetch/source.mjs';
import { LANGUAGES } from '../pipeline/prompts.mjs';

export const BLANK_PACK_ID = 'blank';

export const STARTER_PACKS = Object.freeze([
  Object.freeze({
    id: 'ai-agent-tools',
    name: Object.freeze({ 'zh-CN': 'AI Agent 工具', en: 'AI agent tools' }),
    topics: Object.freeze([
      Object.freeze({ id: 'memory', name: Object.freeze({ 'zh-CN': 'agent 记忆', en: 'agent memory' }) }),
      Object.freeze({ id: 'mcp', name: Object.freeze({ 'zh-CN': 'MCP 生态', en: 'MCP ecosystem' }) }),
      Object.freeze({ id: 'evaluation', name: Object.freeze({ 'zh-CN': '评测', en: 'evaluation' }) }),
    ]),
    // fetched 2026-11-03: every one answered ok (10 / 10 / 10 / 10 / 10 / 10 / 5 / 10 / 2 items)
    sources: Object.freeze([
      Object.freeze({ name: 'arxiv-agent-memory', kind: 'arxiv', query: 'agent memory', topic: 'memory' }),
      Object.freeze({ name: 'hn-agent-memory', kind: 'hn', query: 'agent memory', min_points: 50, topic: 'memory' }),
      Object.freeze({ name: 'mcp-blog', kind: 'rss', url: 'https://blog.modelcontextprotocol.io/index.xml', topic: 'mcp' }),
      Object.freeze({ name: 'arxiv-mcp', kind: 'arxiv', query: 'model context protocol', topic: 'mcp' }),
      Object.freeze({ name: 'hn-mcp', kind: 'hn', query: 'MCP', min_points: 50, topic: 'mcp' }),
      Object.freeze({ name: 'simonwillison', kind: 'rss', url: 'https://simonwillison.net/atom/everything/', topic: 'evaluation' }),
      Object.freeze({ name: 'openai-news', kind: 'rss', url: 'https://openai.com/news/rss.xml', topic: 'evaluation' }),
      Object.freeze({ name: 'arxiv-agent-benchmark', kind: 'arxiv', query: 'agent benchmark', topic: 'evaluation' }),
      Object.freeze({ name: 'hn-agent-benchmark', kind: 'hn', query: 'agent benchmark', min_points: 50, topic: 'evaluation' }),
    ]),
  }),
]);

export const STARTER_PACK_IDS = Object.freeze([BLANK_PACK_ID, ...STARTER_PACKS.map((p) => p.id)]);

const HTTP_URL = /^https?:\/\/\S+$/i;

function languageOf(language) {
  return LANGUAGES.includes(language) ? language : 'zh-CN';
}

export function starterPack(packId) {
  const pack = STARTER_PACKS.find((p) => p.id === packId);
  if (!pack) throw new StreamsError('unknown-pack', `no starter pack "${String(packId)}"`);
  return pack;
}

function topicName(pack, topicId, language) {
  const t = pack.topics.find((x) => x.id === topicId);
  if (!t) throw new StreamsError('bad-pack', `pack ${pack.id}: source topic "${topicId}" is not one of its topics`);
  return t.name[language];
}

// The pack as the page shows it: names in one language, sources without the internal topic id.
export function packView(packId, language) {
  const lang = languageOf(language);
  if (packId === BLANK_PACK_ID) return { id: BLANK_PACK_ID, name: lang === 'en' ? 'Blank' : '空白', topics: [], sources: [] };
  const pack = starterPack(packId);
  return {
    id: pack.id,
    name: pack.name[lang],
    topics: pack.topics.map((t) => t.name[lang]),
    sources: pack.sources.map((s) => ({ name: s.name, kind: s.kind, url: s.url ?? null, ...(s.query ? { query: s.query } : {}), topic: topicName(pack, s.topic, lang) })),
  };
}

export function listStarterPacks(language) {
  return STARTER_PACKS.map((p) => packView(p.id, language));
}

function checkEdits(edits) {
  if (edits === undefined || edits === null) return { removeSources: [], addRss: [] };
  if (!isPlainObject(edits)) throw new StreamsError('bad-edits', 'edits must be an object');
  const remove = edits.removeSources ?? [];
  const add = edits.addRss ?? [];
  if (!Array.isArray(remove) || remove.some((n) => typeof n !== 'string')) throw new StreamsError('bad-edits', 'removeSources must be a list of names');
  if (!Array.isArray(add)) throw new StreamsError('bad-edits', 'addRss must be a list');
  const addRss = add.map((e, i) => {
    if (!isPlainObject(e)) throw new StreamsError('bad-edits', `addRss[${i}] must be an object`);
    const url = typeof e.url === 'string' ? e.url.trim() : '';
    if (!HTTP_URL.test(url)) throw new StreamsError('bad-url', `addRss[${i}]: not an http(s) address`);
    const name = typeof e.name === 'string' && e.name.trim() !== '' ? e.name.trim() : new URL(url).hostname;
    return { name, url };
  });
  return { removeSources: remove, addRss };
}

// Pure: a new config whose topics and sources come from the pack (or nothing, for 'blank'), then the edits.
export function applyStarterPack(config, packId, edits, { language } = {}) {
  if (!isPlainObject(config)) throw new StreamsError('bad-config', 'config must be an object');
  const lang = languageOf(language ?? config.pipeline?.language);
  const e = checkEdits(edits);
  let topics = [];
  let sources = [];
  if (packId !== BLANK_PACK_ID) {
    const pack = starterPack(packId);
    topics = pack.topics.map((t) => ({ name: t.name[lang], keywords: [] }));
    sources = pack.sources.map((s) => {
      const { topic, ...rest } = s;
      return { ...rest, topic: topicName(pack, topic, lang) };
    });
  }
  sources = sources.filter((s) => !e.removeSources.includes(s.name));
  for (const r of e.addRss) {
    if (sources.some((s) => s.name === r.name)) throw new StreamsError('duplicate-source', `a source named "${r.name}" is already there`);
    sources.push({ name: r.name, kind: 'rss', url: r.url });
  }
  for (const s of sources) {
    if (!SOURCE_KINDS.includes(s.kind)) throw new StreamsError('bad-pack', `source ${s.name}: unknown kind "${s.kind}"`);
  }
  return { ...config, topics, sources };
}

// Reads streams.json, applies the pack, writes it back; every other key (name, pipeline, setup …) stays as it was.
export function applyStarterPackToLibrary(libraryDir, packId, edits) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  const path = join(libraryDir, CONFIG_FILE);
  let raw = readFileSync(path, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const next = applyStarterPack(JSON.parse(raw), packId, edits);
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return { config: next };
}
