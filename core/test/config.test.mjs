import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig, topicNames } from '../src/library/config.mjs';
import { caseDir } from './support/tmp.mjs';
import { makeLibrary, TEST_CONFIG } from './support/fixtures.mjs';

test('readConfig reads topics', () => {
  const dir = makeLibrary('config-ok');
  const r = readConfig(dir);
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, TEST_CONFIG);
  assert.deepEqual(topicNames(r.config), ['agent 记忆', 'MCP']);
});

test('topicNames tolerates missing sections', () => {
  assert.deepEqual(topicNames({}), []);
  assert.deepEqual(topicNames(null), []);
});

test('missing streams.json -> code missing, message names the folder', () => {
  const dir = caseDir('config-missing');
  const r = readConfig(dir);
  assert.equal(r.ok, false);
  assert.equal(r.config, null);
  assert.equal(r.error.code, 'missing');
  assert.match(r.error.message, /streams\.json/);
  assert.ok(r.error.message.includes(dir));
});

test('invalid JSON -> code invalid-json with the parser reason', () => {
  const dir = caseDir('config-badjson');
  writeFileSync(join(dir, 'streams.json'), '{ "name": "x", topics: [] }', 'utf8');
  const r = readConfig(dir);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'invalid-json');
  assert.match(r.error.message, /streams\.json/);
  assert.ok(r.error.message.length > 'streams.json: '.length);
});

test('wrong shape -> code invalid-shape naming the offending key', () => {
  const cases = [
    ['[]', /top level/],
    ['{"topics": "agent"}', /"topics" must be an array/],
    ['{"topics": [{"keywords": []}]}', /topics\[0\]/],
    ['{"topics": [{"name": ""}]}', /topics\[0\]/],
    ['{"pipeline": []}', /"pipeline" must be an object/],
  ];
  for (const [text, re] of cases) {
    const dir = caseDir('config-shape');
    writeFileSync(join(dir, 'streams.json'), text, 'utf8');
    const r = readConfig(dir);
    assert.equal(r.ok, false, text);
    assert.equal(r.error.code, 'invalid-shape', text);
    assert.match(r.error.message, re, text);
  }
  // 1.1 W7b: v1.0's scoring steps (pipeline.nodes) are not read any more, so not checked either: any shape of them is kept
  for (const text of ['{"pipeline": {"nodes": {}}}', '{"pipeline": {"nodes": [{"name": "relevance"}]}}']) {
    const dir = caseDir('config-shape-nodes');
    writeFileSync(join(dir, 'streams.json'), text, 'utf8');
    assert.equal(readConfig(dir).ok, true, text);
  }
});

test('sentinel: a BOM-prefixed but otherwise valid file is accepted; a truncated one is not', () => {
  const dir = caseDir('config-bom');
  writeFileSync(join(dir, 'streams.json'), '﻿{"name":"x","topics":[],"pipeline":{"nodes":[{"id":"relevance"}]}}', 'utf8');
  assert.equal(readConfig(dir).ok, true);
  writeFileSync(join(dir, 'streams.json'), '{"name":"x","topics":[', 'utf8');
  assert.equal(readConfig(dir).ok, false);
  assert.equal(readConfig(dir).error.code, 'invalid-json');
});
