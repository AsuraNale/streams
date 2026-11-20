// 1.1 W1 (骨架): the definition of objects and actions, the check every request goes through, actions held for the user,
// the record of actions done, the list an agent is given, and the two SOPs. Acceptance B2, B3, B4, C2, C3.
// Each test was written to fail first: the inputs below are the ones that should be refused, and the library folder is
// hashed before and after to show that a refused or held action changed nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  loadDefinition, checkDefinition, actionsFor, DEFINITION_PATH,
  createActionRunner, checkActionRequest, readActionLog, ACTION_LOG, startupCheck,
  loadSop, renderSop, checkSops, placeholdersOf, SOP_DIR, SOP_NAMES,
} from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const def = loadDefinition();
const raw = () => JSON.parse(readFileSync(DEFINITION_PATH, 'utf8'));

function hashTree(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { h.update(`D ${relative(dir, p)}\n`); walk(p); }
      else { h.update(`F ${relative(dir, p)}\n`); h.update(readFileSync(p)); }
    }
  };
  walk(dir);
  return h.digest('hex');
}

// a library folder with something in it, a pending folder outside it, and handlers that change the library
function rig(name, { definition = def } = {}) {
  const root = caseDir(`w1-${name}`);
  const lib = join(root, 'library');
  mkdirSync(join(lib, 'items'), { recursive: true });
  writeFileSync(join(lib, 'card.json'), JSON.stringify({ name: 'demo', sources: ['a'] }) + '\n');
  writeFileSync(join(lib, 'items', 'i1.json'), JSON.stringify({ id: 'i1', state: 'new' }) + '\n');
  const calls = [];
  const write = (file, value) => writeFileSync(join(lib, file), JSON.stringify(value) + '\n');
  const handler = (action, type) => (params) => {
    calls.push(action);
    write(`done-${action}.json`, params);
    return { object: { type, id: params.item ?? params.library ?? params.url ?? 'x' }, before: { n: 0 }, after: { n: 1 } };
  };
  const handlers = {};
  for (const [n, a] of Object.entries(definition.actions)) if (!a.tool) handlers[n] = handler(n, a.object);
  const logPath = join(lib, ACTION_LOG);
  const runner = createActionRunner({ definition, handlers, pendingDir: join(root, 'app-data', 'pending'), logFile: () => logPath, now: () => new Date('2026-11-20T12:00:00Z') });
  return { root, lib, calls, runner, handlers, logPath, pendingDir: join(root, 'app-data', 'pending') };
}

// ---- definition -------------------------------------------------------------------------------------------------------

test('definition · the seven objects of the handoff and how they link', () => {
  assert.deepEqual(Object.keys(def.objects).sort(), ['card', 'item', 'library', 'note', 'original', 'source', 'summary']);
  const links = (o) => Object.keys(def.objects[o].links ?? {});
  assert.ok(links('library').includes('card') && links('library').includes('source') && links('library').includes('item'));
  assert.ok(links('item').includes('original') && links('item').includes('summary'));
  assert.ok(links('summary').includes('original'), 'a summary points back to its original');
  assert.ok(links('note').includes('item'));
});

test('definition · the eight kinds of action, each with who, confirmation and its params', () => {
  const byKind = {
    1: ['create_library'], 2: ['edit_card', 'add_source', 'remove_source'], 3: ['read_page', 'search', 'query_library'],
    4: ['submit_items'], 5: ['save_original'], 6: ['keep'], 7: ['dismiss', 'later'], 8: ['convert_library'],
  };
  for (const [kind, names] of Object.entries(byKind)) for (const n of names) assert.ok(def.actions[n], `kind ${kind}: ${n}`);
  assert.equal(Object.keys(def.actions).length, Object.values(byKind).flat().length);
  for (const [n, a] of Object.entries(def.actions)) {
    assert.ok(a.actors.length > 0, `${n}: who`);
    assert.equal(typeof a.confirm, 'boolean', `${n}: confirm`);
    assert.equal(a.params.type, 'object', `${n}: params`);
  }
  // only the user keeps, dismisses, puts off and converts; only the program stores originals
  for (const n of ['keep', 'dismiss', 'later', 'convert_library']) assert.deepEqual(def.actions[n].actors, ['user'], n);
  assert.deepEqual(def.actions.save_original.actors, ['program']);
  assert.deepEqual(def.actions.submit_items.actors, ['update_agent']);
});

test('definition · a broken file is refused with where it is broken', () => {
  const dir = caseDir('w1-def-broken');
  const p = join(dir, 'streams.json');
  writeFileSync(p, '{ "schema": "streams.ontology/1", ');
  assert.throws(() => loadDefinition({ path: p }), (e) => e.code === 'ontology-invalid' && /cannot be read as JSON/.test(e.message));

  const noActor = raw(); delete noActor.actions.add_source.actors;
  writeFileSync(p, JSON.stringify(noActor));
  assert.throws(() => loadDefinition({ path: p }), (e) => e.code === 'ontology-invalid' && /actions\.add_source\.actors/.test(e.message));

  const ghost = raw(); ghost.actions.keep.actors = ['user', 'robot'];
  assert.match(checkDefinition(ghost).join('\n'), /actions\.keep\.actors: "robot" is not an actor/);
  const noObject = raw(); noObject.actions.keep.object = 'folder';
  assert.match(checkDefinition(noObject).join('\n'), /actions\.keep\.object: "folder" is not an object/);
  const toolConfirm = raw(); toolConfirm.actions.search.confirm = true;
  assert.match(checkDefinition(toolConfirm).join('\n'), /actions\.search: a tool .* never one the user confirms/);
  const badParams = raw(); badParams.actions.dismiss.params.properties.reason.maxLen = 3;
  assert.match(checkDefinition(badParams).join('\n'), /actions\.dismiss\.params\.reason: "maxLen" is not a schema keyword/);
  const badLink = raw(); badLink.objects.item.links.page = 'many';
  assert.match(checkDefinition(badLink).join('\n'), /objects\.item\.links\.page: no such object/);
  assert.deepEqual(checkDefinition(raw()), [], 'the shipped file itself has no problem');
});

// ---- the check (B2) ---------------------------------------------------------------------------------------------------

test('check · an action not in the definition (writing a file directly) is refused and the library is untouched', async () => {
  const r = rig('check-unknown');
  const before = hashTree(r.lib);
  for (const req of [
    { action: 'write_file', params: { path: 'notes/x.md', text: 'hi' } },
    { action: 'delete_library', params: { library: 'demo' } },
    { action: '__proto__', params: {} },
    { action: 'toString', params: {} },
    { params: {} },
    'write_file',
  ]) {
    const out = await r.runner.request('main_agent', req);
    assert.equal(out.status, 'rejected', JSON.stringify(req));
    assert.ok(out.errors.length > 0);
  }
  const out = await r.runner.request('main_agent', { action: 'write_file', params: {} });
  assert.match(out.errors[0], /"write_file" is not an action of the definition/);
  assert.equal(hashTree(r.lib), before);
  assert.deepEqual(r.calls, []);
  assert.equal(existsSync(r.logPath), false);
  assert.equal(existsSync(r.pendingDir), false);
});

test('check · an action this actor may not do is refused, with why', async () => {
  const r = rig('check-actor');
  const before = hashTree(r.lib);
  const cases = [
    ['update_agent', { action: 'create_library', params: { card: {} } }],
    ['main_agent', { action: 'keep', params: { item: 'i1' } }],
    ['update_agent', { action: 'dismiss', params: { item: 'i1' } }],
    ['main_agent', { action: 'save_original', params: { url: 'https://example.org' } }],
    ['main_agent', { action: 'convert_library', params: { library: 'demo', card: {} } }],
    ['main_agent', { action: 'submit_items', params: { items: [] } }],
  ];
  for (const [who, req] of cases) {
    const out = await r.runner.request(who, req);
    assert.equal(out.status, 'rejected', `${who} ${req.action}`);
    assert.match(out.errors[0], new RegExp(`"${who}" may not do "${req.action}"`));
  }
  assert.equal(hashTree(r.lib), before);
  assert.deepEqual(r.calls, []);
});

test('check · params that do not fit are refused, saying where', async () => {
  const r = rig('check-params');
  const before = hashTree(r.lib);
  const cases = [
    [{ action: 'add_source', params: { library: 'demo', source: { url: 'https://x' } } }, /params\.source\.name: missing/],
    [{ action: 'add_source', params: { library: 'demo' } }, /params\.source: missing/],
    [{ action: 'add_source', params: { library: 'demo', source: { name: 'x' }, path: '../../etc' } }, /params\.path: not a field/],
    [{ action: 'remove_source', params: { library: '', source: 'a' } }, /params\.library: too short/],
    [{ action: 'edit_card', params: { library: 'demo', card: 'not an object' } }, /params\.card/],
    [{ action: 'submit_items', params: { items: Array.from({ length: 31 }, () => ({})) } }, /params\.items: more than 30/],
  ];
  for (const [req, why] of cases) {
    const who = req.action === 'submit_items' ? 'update_agent' : 'main_agent';
    const out = await r.runner.request(who, req);
    assert.equal(out.status, 'rejected', req.action);
    assert.match(out.errors.join('\n'), why);
  }
  assert.equal(hashTree(r.lib), before);
  assert.deepEqual(r.calls, []);
  assert.equal(existsSync(r.pendingDir), false, 'nothing held either');
});

test('check · a tool (reading, searching) is used during a run, not handed in', async () => {
  const r = rig('check-tool');
  for (const req of [{ action: 'read_page', params: { url: 'https://x' } }, { action: 'search', params: { query: 'q' } }]) {
    const out = await r.runner.request('update_agent', req);
    assert.equal(out.status, 'rejected');
    assert.match(out.errors[0], /a tool used during the run/);
  }
  // with a handler for it (a later version's own tools) it is let through
  const ok = checkActionRequest(def, 'update_agent', { action: 'search', params: { query: 'q' } }, { handlers: { search: () => {} } });
  assert.equal(ok.ok, true);
});

// ---- held for the user (B3) -------------------------------------------------------------------------------------------

test('confirm · exactly building, changing the card, adding and removing sources, and converting wait for the user', () => {
  const held = Object.entries(def.actions).filter(([, a]) => a.confirm).map(([n]) => n).sort();
  assert.deepEqual(held, ['add_source', 'convert_library', 'create_library', 'edit_card', 'remove_source']);
});

test('confirm · a held action changes nothing until confirmed; confirmed, it is done once and recorded', async () => {
  const r = rig('confirm-yes');
  const before = hashTree(r.lib);
  const reqs = [
    ['main_agent', { action: 'create_library', params: { card: { name: 'new' } } }],
    ['main_agent', { action: 'edit_card', params: { library: 'demo', card: { name: 'demo2' }, why: 'narrower' } }],
    ['user', { action: 'add_source', params: { library: 'demo', source: { name: 'b', url: 'https://b' } } }],
    ['main_agent', { action: 'remove_source', params: { library: 'demo', source: 'a' } }],
    ['user', { action: 'convert_library', params: { library: 'demo', card: {} } }],
  ];
  const ids = [];
  for (const [who, req] of reqs) {
    const out = await r.runner.request(who, req);
    assert.equal(out.status, 'pending', req.action);
    ids.push(out.pending.id);
  }
  assert.equal(hashTree(r.lib), before, 'the library is as it was');
  assert.deepEqual(r.calls, []);
  assert.equal(existsSync(r.logPath), false, 'nothing recorded as done');
  assert.equal(r.runner.pending().length, 5);
  assert.ok(!r.pendingDir.startsWith(r.lib), 'held outside the library');

  const out = await r.runner.confirm(ids[1], { by: 'user' });
  assert.equal(out.status, 'done');
  assert.deepEqual(r.calls, ['edit_card']);
  assert.notEqual(hashTree(r.lib), before);
  const log = readActionLog(r.logPath);
  assert.equal(log.length, 1);
  assert.equal(log[0].confirmedBy, 'user');
  assert.equal(log[0].pendingId, ids[1]);
  assert.equal(r.runner.pending().length, 4);
  // confirming the same one again does nothing
  assert.equal((await r.runner.confirm(ids[1])).status, 'rejected');
  assert.deepEqual(r.calls, ['edit_card']);
});

test('confirm · rejected, a held action leaves everything as it was', async () => {
  const r = rig('confirm-no');
  const before = hashTree(r.lib);
  const out = await r.runner.request('main_agent', { action: 'add_source', params: { library: 'demo', source: { name: 'c' } } });
  assert.equal(out.status, 'pending');
  assert.equal(r.runner.reject(out.pending.id).status, 'dropped');
  assert.equal(r.runner.pending().length, 0);
  assert.equal((await r.runner.confirm(out.pending.id)).status, 'rejected');
  assert.equal(hashTree(r.lib), before);
  assert.deepEqual(r.calls, []);
  assert.equal(existsSync(r.logPath), false);
  assert.equal(r.runner.reject('no-such').status, 'rejected');
});

test('confirm · a held action is checked again when confirmed (the definition may have changed)', async () => {
  const r = rig('confirm-recheck');
  const out = await r.runner.request('main_agent', { action: 'remove_source', params: { library: 'demo', source: 'a' } });
  const narrower = structuredClone(raw());
  delete narrower.actions.remove_source;
  const later = createActionRunner({ definition: narrower, handlers: r.handlers, pendingDir: r.pendingDir, logFile: () => r.logPath });
  const before = hashTree(r.lib);
  const c = await later.confirm(out.pending.id);
  assert.equal(c.status, 'rejected');
  assert.match(c.errors[0], /not an action of the definition/);
  assert.equal(hashTree(r.lib), before);
  assert.deepEqual(r.calls, []);
});

// ---- the record (B4) --------------------------------------------------------------------------------------------------

test('log · five kinds of action done once each give five records, each with who, when, what, before and after', async () => {
  const r = rig('log-five');
  const done = [
    ['update_agent', { action: 'submit_items', params: { items: [{ title: 't' }] } }],
    ['program', { action: 'save_original', params: { url: 'https://example.org/a', method: 'direct' } }],
    ['user', { action: 'keep', params: { item: 'i1' } }],
    ['user', { action: 'dismiss', params: { item: 'i1', reason: 'off topic' } }],
    ['user', { action: 'later', params: { item: 'i1' } }],
  ];
  for (const [who, req] of done) assert.equal((await r.runner.request(who, req)).status, 'done', req.action);
  // refused and held ones are not records
  await r.runner.request('main_agent', { action: 'write_file', params: {} });
  await r.runner.request('main_agent', { action: 'add_source', params: { library: 'demo', source: { name: 'z' } } });
  const log = readActionLog(r.logPath);
  assert.equal(log.length, 5);
  assert.deepEqual(log.map((l) => l.action), ['submit_items', 'save_original', 'keep', 'dismiss', 'later']);
  assert.deepEqual(log.map((l) => l.actor), ['update_agent', 'program', 'user', 'user', 'user']);
  for (const l of log) {
    assert.equal(l.ts, '2026-11-20T12:00:00.000Z');
    assert.equal(typeof l.object.type, 'string');
    assert.ok(l.object.id);
    assert.deepEqual(l.before, { n: 0 });
    assert.deepEqual(l.after, { n: 1 });
  }
  assert.deepEqual(log.map((l) => l.object.type), ['item', 'original', 'note', 'item', 'item']);
});

test('log · an action whose handler fails is not recorded as done', async () => {
  const r = rig('log-fail');
  const runner = createActionRunner({ definition: def, handlers: { keep: () => { throw new Error('disk full'); } }, pendingDir: r.pendingDir, logFile: () => r.logPath });
  const out = await runner.request('user', { action: 'keep', params: { item: 'i1' } });
  assert.equal(out.status, 'failed');
  assert.equal(existsSync(r.logPath), false);
  const silent = createActionRunner({ definition: def, handlers: { keep: () => ({}) }, pendingDir: r.pendingDir, logFile: () => r.logPath });
  assert.equal((await silent.request('user', { action: 'keep', params: { item: 'i1' } })).status, 'failed', 'a handler must say what it changed');
});

// ---- the list comes from the file (C3) --------------------------------------------------------------------------------

test('list-from-file · an action added to the file is on the list and can be done; one taken out is gone and refused', async () => {
  const dir = caseDir('w1-list');
  const p = join(dir, 'streams.json');
  const d = raw();
  d.actions.tag_item = { object: 'item', actors: ['main_agent'], confirm: false, about: 'a test action', params: { type: 'object', required: ['item'], properties: { item: { type: 'string', minLength: 1 } }, additionalProperties: false } };
  delete d.actions.add_source;
  writeFileSync(p, JSON.stringify(d));
  const changed = loadDefinition({ path: p });
  const names = actionsFor(changed, 'main_agent').map((a) => a.name);
  assert.ok(names.includes('tag_item'));
  assert.ok(!names.includes('add_source'));
  assert.ok(actionsFor(def, 'main_agent').map((a) => a.name).includes('add_source'), 'the shipped file still has it');
  assert.ok(!actionsFor(def, 'main_agent').map((a) => a.name).includes('tag_item'));

  const r = rig('list-run', { definition: changed });
  assert.equal((await r.runner.request('main_agent', { action: 'tag_item', params: { item: 'i1' } })).status, 'done');
  const gone = await r.runner.request('main_agent', { action: 'add_source', params: { library: 'demo', source: { name: 'q' } } });
  assert.equal(gone.status, 'rejected');
  assert.match(gone.errors[0], /not an action of the definition/);
  // what an agent sees of each action: name, object, whether it is held, its params
  const one = actionsFor(def, 'main_agent').find((a) => a.name === 'edit_card');
  assert.deepEqual(Object.keys(one).sort(), ['about', 'budget', 'confirm', 'name', 'object', 'params', 'tool']);
  assert.equal(one.confirm, true);
});

// ---- the two SOPs (C2) ------------------------------------------------------------------------------------------------

test('sop · two files of their own, thin, without the wording of the simulation', () => {
  assert.deepEqual([...SOP_NAMES], ['build', 'update']);
  for (const n of SOP_NAMES) {
    const text = loadSop(n);
    assert.ok(text.length < 8000, `${n} is thin`);
    for (const w of ['模拟', '模拟方', '今天是 2026-11-19', '2026-11-19', 'simulat']) assert.ok(!text.includes(w), `${n}: "${w}"`);
  }
  assert.deepEqual(placeholdersOf(loadSop('build')).sort(), ['ACTIONS', 'BUDGET', 'OUTPUT', 'TODAY', 'TOOLS']);
  assert.deepEqual(placeholdersOf(loadSop('update')).sort(), ['ACTIONS', 'BUDGET', 'CARD', 'NEW', 'OUTPUT', 'STATE', 'TODAY', 'TOOLS']);
});

test('sop · filled with the tools, budget and format; a placeholder left unfilled is an error, never sent as it is', () => {
  const text = loadSop('build');
  const vars = { TODAY: '2026-11-20', TOOLS: 'TOOL-LIST-X', BUDGET: 'BUDGET-Y', ACTIONS: 'ACTIONS-Z', OUTPUT: 'OUTPUT-W' };
  const out = renderSop(text, vars);
  for (const v of Object.values(vars)) assert.ok(out.includes(v));
  assert.equal(placeholdersOf(out).length, 0);
  const { BUDGET, ...short } = vars;
  assert.throws(() => renderSop(text, short), (e) => e.code === 'sop-unfilled' && e.missing.includes('BUDGET'));
  assert.throws(() => renderSop(text, { ...vars, TOOLS: null }), (e) => e.code === 'sop-unfilled');
});

test('sop · a rule changed in the file changes what the agent is told, with no change to code', () => {
  const dir = caseDir('w1-sop-edit');
  for (const n of SOP_NAMES) copyFileSync(join(SOP_DIR, `${n}.md`), join(dir, `${n}.md`));
  const vars = { TODAY: 'd', TOOLS: 't', BUDGET: 'b', ACTIONS: 'a', OUTPUT: 'o' };
  const was = renderSop(loadSop('build', { dir }), vars);
  writeFileSync(join(dir, 'build.md'), readFileSync(join(dir, 'build.md'), 'utf8') + '\n- 新规矩：每个来源至少读两页。\n');
  const now = renderSop(loadSop('build', { dir }), vars);
  assert.notEqual(now, was);
  assert.ok(now.includes('新规矩：每个来源至少读两页'));
  assert.ok(!was.includes('新规矩'));
});

test('sop · a missing or empty SOP stops the start-up check, never an empty prompt', () => {
  assert.deepEqual(startupCheck(), { ok: true, problems: [] }, 'the shipped files pass');
  const dir = caseDir('w1-sop-missing');
  copyFileSync(join(SOP_DIR, 'update.md'), join(dir, 'update.md'));
  let c = startupCheck({ sopDir: dir });
  assert.equal(c.ok, false);
  assert.deepEqual(c.problems.map((p) => p.code), ['sop-missing']);
  assert.match(c.problems[0].message, /build SOP is missing/);
  writeFileSync(join(dir, 'build.md'), '  \n\n');
  c = startupCheck({ sopDir: dir });
  assert.deepEqual(c.problems.map((p) => p.code), ['sop-empty']);
  unlinkSync(join(dir, 'update.md'));
  assert.deepEqual(checkSops({ dir }).problems.map((p) => p.code), ['sop-empty', 'sop-missing']);
  assert.throws(() => loadSop('build', { dir }), (e) => e.code === 'sop-empty');
  assert.throws(() => loadSop('nope'), (e) => e.code === 'bad-argument');
});

test('startup · a broken definition stops the start-up check too', () => {
  const dir = caseDir('w1-startup-def');
  const p = join(dir, 'streams.json');
  writeFileSync(p, 'not json');
  const c = startupCheck({ definitionPath: p });
  assert.equal(c.ok, false);
  assert.deepEqual(c.problems.map((x) => x.code), ['ontology-invalid']);
  assert.equal(startupCheck({ definitionPath: join(dir, 'missing.json') }).ok, false);
});
