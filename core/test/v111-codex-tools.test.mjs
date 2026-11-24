// 1.1.1 P3 (C8): Codex is told of the tool it has — web_search (search, open a page, find words in it) — in the build and in
// the update alike; the update agent's SOP takes the tools of its own connection (runUpdate's kind). Each check holds first
// the state that would make it fail (Claude Code's two tools).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { toolsText } from '../src/build/format.mjs';
import { updateToolsText, UPDATE_TOOLS } from '../src/update/format.mjs';
import { runUpdate, createLibrary, writeCard } from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

test('Codex\'s tool in words: web_search, one tool — the same sentence for the build and the update; Claude Code\'s two tools stay', () => {
  const cx = toolsText('codex');
  assert.match(cx, /web_search/);
  assert.equal(/WebFetch|WebSearch/.test(cx), false);
  assert.equal(updateToolsText('codex'), cx, 'build and update say the same');
  assert.equal(updateToolsText('claude-code'), UPDATE_TOOLS);
  assert.match(UPDATE_TOOLS, /WebFetch/);
});

test('runUpdate tells the update agent of its own connection\'s tools: Codex gets web_search, not WebFetch', async () => {
  const dir = join(caseDir('v111-codex-tools'), 'lib');
  createLibrary(dir, { name: '测试', language: 'zh-CN' });
  writeCard(dir, {
    name: '测试', definition: { summary: 's', purpose: 'p', scope: 's', exclude: 'e', trust: 't', rhythm: '每天一次', language: 'l', hard: 'h' },
    decide: [], collect: ['c'], skip: ['k'], sources: [{ name: 'a', url: 'https://a.example.test/', status: 'ok' }], unreadable: [],
    pick: ['p'], write: ['w'], samples: [{ title: 't', url: 'https://a.example.test/1', date: '2026-11-21' }],
  });
  const prompts = [];
  const connector = { async detect() { return { installed: true, loggedIn: true }; }, async send(req) { prompts.push(req.prompt); return { ok: true, json: { items: [] }, text: '{"items":[]}', sessionId: 's', reads: [], searches: [] }; } };
  const judge = { async complete() { return { ok: false, code: 'unknown' }; } };
  const readLinks = async (url) => ({ ok: true, url, links: [], method: 'direct' });
  const readPage = async (url) => ({ ok: false, url, reason: 'dead' });
  const r = await runUpdate(dir, { connector, judge, kind: 'codex', readPage, readLinks, now: () => new Date('2026-11-24T15:00:00Z') });
  assert.ok(prompts.length >= 1, JSON.stringify(r.record ?? r));
  assert.ok(prompts[0].includes(toolsText('codex')), 'Codex\'s tool');
  assert.equal(prompts[0].includes('WebFetch'), false, 'not Claude Code\'s');
});
