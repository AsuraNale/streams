// 1.1.1 P6: an option written as an object with its words (DeepSeek, 11-24 live run: every choice question came back as
// [{ "text": "…" }] and was never shown, so the customer answered questions it had not seen) is read as those words; an
// object without words is still an empty option. The answer's format says options are strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkQuestion } from '../src/build/questions.mjs';
import { OUTPUT_TEXT } from '../src/build/format.mjs';
import { problemText } from '../src/build/conversation.mjs';

const asked = [{ text: '拿来做什么？', kind: 'input', options: [] }];

test('options as { text } / { label } are read as their words; the question is shown', () => {
  const c = checkQuestion({ text: '多久看一次？', kind: 'single', options: [{ text: '每周一次' }, { label: '每个交易日' }, { text: '你定' }] }, asked);
  assert.equal(c.ok, true, JSON.stringify(c.problems));
  assert.deepEqual(c.question.options, ['每周一次', '每个交易日', '你定']);
});

test('an object with no words is still an empty option; strings as before; 「其它」 still left to the interface', () => {
  assert.deepEqual(checkQuestion({ text: 'x？', kind: 'single', options: [{ text: '甲' }, { value: 3 }] }, asked).problems, ['bad-option']);
  assert.deepEqual(checkQuestion({ text: 'x？', kind: 'multi', options: ['甲', '乙', { text: '其它' }] }, asked).question.options, ['甲', '乙']);
});

test('the answer\'s format and the sending back both say an option is a string', () => {
  assert.match(OUTPUT_TEXT, /每个是一个字符串/);
  assert.match(problemText('bad-option'), /字符串/);
});
