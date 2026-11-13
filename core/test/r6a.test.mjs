// Redesign R6a (docs/checks/2026-11-13-r6a/contract.md R6a-2; 维护者 11-11 第 1 条, V9): what 问库 says when the library has nothing
// on the question is 「库内暂无相关内容。」 — the core's own copy of that sentence (agent/words.mjs NOT_IN_LIBRARY), which the
// main agent is given in its word list so that it says what the page says. (The page's dictionaries and the real window:
// tests/acceptance/v09-ask-citations.test.mjs.) Mutant: scripts/mutation-check.mjs r6a-core-sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_SYSTEM, NOT_IN_LIBRARY, UI_TERMS } from '../src/index.mjs';

test('R6a NOT_IN_LIBRARY: 「库内暂无相关内容。」 and its English, listed in the main agent\'s words and system prompt; the sentence before R6a is gone', () => {
  assert.deepEqual({ ...NOT_IN_LIBRARY }, { zh: '库内暂无相关内容。', en: 'Nothing in this library on that.' });
  assert.ok(Object.isFrozen(NOT_IN_LIBRARY));
  const rows = UI_TERMS.filter(([, zh]) => zh === NOT_IN_LIBRARY.zh);
  assert.equal(rows.length, 1, 'one row of the word list');
  assert.equal(rows[0][2], NOT_IN_LIBRARY.en);
  assert.match(rows[0][0], /问库/);
  const system = String(AGENT_SYSTEM);
  assert.ok(system.includes('库内暂无相关内容。') && system.includes('Nothing in this library on that.'), 'the system prompt lists it');
  // controls: the old sentence is told apart, and is nowhere in what the main agent is told
  assert.notEqual('库里没有。', NOT_IN_LIBRARY.zh);
  assert.equal(UI_TERMS.some(([, zh]) => zh.includes('库里没有')), false);
  assert.equal(system.includes('库里没有。'), false);
});
