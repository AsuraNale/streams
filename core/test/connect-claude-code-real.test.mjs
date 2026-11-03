// The real success envelope of `claude -p --output-format json` (2.1.287, signed in, 2026-11-03), kept
// verbatim with ids zeroed: the parser's calibration against what the CLI actually prints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClaudeCodeConnector, parseClaudeOutput } from '../src/connect/claude-code.mjs';
import { fakeSpawn } from './support/fake-spawn.mjs';
import { caseDir } from './support/tmp.mjs';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const REAL = JSON.parse(readFileSync(new URL('./support/real-claude-success.json', import.meta.url), 'utf8'));

test('fixture is the real thing: exit 0, one JSON object, is_error false, end_turn / completed', () => {
  assert.equal(REAL.status, 0);
  assert.equal(REAL.stderr, '');
  const env = JSON.parse(REAL.stdout);
  assert.equal(env.type, 'result');
  assert.equal(env.is_error, false);
  assert.equal(env.stop_reason, 'end_turn');
  assert.equal(env.terminal_reason, 'completed');
  assert.equal(env.result, '{"ok":true}');
});

test('parseClaudeOutput on the real success: ok, text, model from modelUsage, tokens summed over cache fields, cost', () => {
  const p = parseClaudeOutput({ stdout: REAL.stdout, stderr: REAL.stderr, status: REAL.status });
  assert.equal(p.ok, true);
  assert.equal(p.text, '{"ok":true}');
  assert.equal(p.model, 'claude-fable-5-1');
  assert.deepEqual(p.usage, { inputTokens: 2 + 445 + 3524, outputTokens: 9, costUsd: 0.010251 });
});

test('the connector end to end on the real success: probe ok, json parsed, usage.calls 1', async () => {
  const dir = caseDir('claude-real-path');
  const file = process.platform === 'win32' ? join(dir, 'claude.exe') : join(dir, 'claude');
  writeFileSync(file, '');
  const spawnImpl = fakeSpawn({ stdout: REAL.stdout, stderr: '', status: 0 });
  const c = createClaudeCodeConnector({ kind: 'claude-code' }, { spawnImpl, env: { PATH: dir, Path: dir, PATHEXT: '.EXE;.CMD' }, tmpRoot: caseDir('claude-real-tmp') });
  const r = await c.probe();
  assert.equal(r.ok, true);
  assert.equal(r.model, 'claude-fable-5-1');
  assert.deepEqual(r.usage, { calls: 1, inputTokens: 3971, outputTokens: 9, costUsd: 0.010251 });
  const full = await c.complete({ prompt: 'x', format: 'json' });
  assert.deepEqual(full.json, { ok: true });
});

test('reverse: the same envelope with is_error flipped, or with the signed-out wording, is not a success', () => {
  const env = JSON.parse(REAL.stdout);
  const flipped = { ...env, is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' };
  const p = parseClaudeOutput({ stdout: JSON.stringify(flipped), stderr: '', status: 0 });
  assert.equal(p.ok, false);
  assert.equal(p.code, 'login-expired');
  const refusal = { ...env, stop_reason: 'refusal' };
  assert.equal(parseClaudeOutput({ stdout: JSON.stringify(refusal), stderr: '', status: 0 }).code, 'refused');
});
