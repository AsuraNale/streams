import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_CODE_MODELS, CODEX_MODELS, VENDORS, VENDOR_IDS, modelsFor, recommendedModel, defaultModelFor, resolveModel } from '../src/connect/models.mjs';
import { CONNECTION_KINDS, ERROR_CODES, MODEL_SLOTS } from '../src/connect/types.mjs';

test('tables: exactly one recommended per list, ids unique, labels present', () => {
  const lists = [CLAUDE_CODE_MODELS, CODEX_MODELS, ...Object.values(VENDORS).map((v) => v.models).filter((m) => m.length > 0)];
  for (const list of lists) {
    assert.equal(list.filter((m) => m.recommended).length, 1, JSON.stringify(list));
    assert.equal(new Set(list.map((m) => m.id)).size, list.length);
    for (const m of list) assert.ok(typeof m.label === 'string' && m.label !== '');
  }
  assert.equal(CLAUDE_CODE_MODELS[0].id, 'claude-fable-5-1');
  assert.equal(CLAUDE_CODE_MODELS[0].recommended, true);
});

test('vendors: the spec presets with base URLs; custom has none', () => {
  assert.deepEqual(VENDOR_IDS, ['anthropic', 'openai', 'deepseek', 'moonshot', 'zhipu', 'gemini', 'custom']);
  assert.equal(VENDORS.anthropic.baseUrl, 'https://api.anthropic.com');
  assert.equal(VENDORS.anthropic.style, 'anthropic');
  assert.equal(VENDORS.openai.baseUrl, 'https://api.openai.com/v1');
  assert.equal(VENDORS.deepseek.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(VENDORS.moonshot.baseUrl, 'https://api.moonshot.cn/v1');
  assert.equal(VENDORS.zhipu.baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(VENDORS.gemini.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(VENDORS.custom.baseUrl, null);
  for (const id of VENDOR_IDS) if (id !== 'anthropic') assert.equal(VENDORS[id].style, 'openai', id);
});

test('modelsFor returns copies; unknown kind / vendor throw', () => {
  const a = modelsFor('claude-code');
  a[0].id = 'mutated';
  assert.equal(CLAUDE_CODE_MODELS[0].id, 'claude-fable-5-1');
  assert.equal(modelsFor('api', 'deepseek')[0].id, 'deepseek-chat');
  assert.deepEqual(modelsFor('api', 'custom'), []);
  assert.throws(() => modelsFor('api', 'nope'), (e) => e.code === 'bad-connection');
  assert.throws(() => modelsFor('ollama'), (e) => e.code === 'bad-connection');
});

test('defaults: CLIs pass no model; api uses the vendor recommendation', () => {
  assert.equal(defaultModelFor('claude-code'), undefined);
  assert.equal(defaultModelFor('codex'), undefined);
  assert.equal(defaultModelFor('api', 'anthropic'), 'claude-opus-5-5');
  assert.equal(recommendedModel('codex'), 'gpt-6.1-sol');
  assert.equal(recommendedModel('api', 'custom'), undefined);
});

test('resolveModel: verify defaults to main; main defaults to the kind default', () => {
  const cc = { kind: 'claude-code', model: 'claude-opus-5-5' };
  assert.equal(resolveModel(cc), 'claude-opus-5-5');
  assert.equal(resolveModel(cc, 'main'), 'claude-opus-5-5');
  assert.equal(resolveModel(cc, 'verify'), 'claude-opus-5-5');
  assert.equal(resolveModel({ kind: 'claude-code' }, 'verify'), undefined, 'no model -> no --model, for both slots');
  assert.equal(resolveModel({ kind: 'api', api: { vendor: 'deepseek', keyRef: 'k' } }, 'verify'), 'deepseek-chat');
  assert.equal(resolveModel({ kind: 'api', model: '', api: { vendor: 'anthropic', keyRef: 'k' } }), 'claude-opus-5-5', 'empty string counts as unset');
});

test('resolveModel: explicit verify model and hand-typed ids win', () => {
  const cc = { kind: 'claude-code', model: 'claude-opus-5-5', verifyModel: 'claude-haiku-5-5' };
  assert.equal(resolveModel(cc, 'verify'), 'claude-haiku-5-5');
  assert.equal(resolveModel(cc, 'main'), 'claude-opus-5-5');
  assert.equal(resolveModel({ kind: 'codex', model: 'gpt-7-typed-by-hand' }), 'gpt-7-typed-by-hand', 'ids outside the table are allowed');
  assert.equal(resolveModel(cc, 'claude-sonnet-5-5'), 'claude-sonnet-5-5', 'a concrete id as slot is used as-is');
  assert.equal(resolveModel(cc, '  claude-sonnet-5-5 '), 'claude-sonnet-5-5');
});

test('resolveModel: refuses unknown kinds and empty slots', () => {
  assert.throws(() => resolveModel({ kind: 'ollama' }), (e) => e.code === 'bad-connection');
  assert.throws(() => resolveModel(null), (e) => e.code === 'bad-connection');
  assert.throws(() => resolveModel({ kind: 'codex' }, ''), (e) => e.code === 'bad-request');
  assert.throws(() => resolveModel({ kind: 'codex' }, 42), (e) => e.code === 'bad-request');
});

test('vocabulary is the spec list', () => {
  assert.deepEqual(CONNECTION_KINDS, ['claude-code', 'codex', 'api']);
  assert.deepEqual(ERROR_CODES, ['not-installed', 'not-logged-in', 'login-expired', 'bad-key', 'bad-model', 'rate-limited', 'network', 'timeout', 'bad-format', 'refused', 'unknown', 'not-applicable', 'stopped']);
  assert.deepEqual(MODEL_SLOTS, ['main', 'verify']);
});

test('sentinel: verify must not silently differ from main when unset', () => {
  const cc = { kind: 'claude-code', model: 'claude-opus-5-5', verifyModel: '' };
  assert.notEqual(resolveModel(cc, 'verify'), 'claude-haiku-5-5');
  assert.equal(resolveModel(cc, 'verify'), resolveModel(cc, 'main'));
});
