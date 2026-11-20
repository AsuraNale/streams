// Doing an action (1.1 W1): the one way an agent's answer changes anything. An agent hands in requests
// { action, params }; each is checked against the definition (definition.mjs) before anything happens:
//   unknown action                 -> rejected ("not an action of the definition")         B2, C3
//   the actor may not do it         -> rejected                                              B2
//   params do not fit its schema    -> rejected, with where                                  B2
//   a tool (reading, searching)     -> rejected as a request: tools are used during a run, not handed in, unless the
//                                      caller gives a handler for it (a later version's own tools)
// What passes:
//   confirm: true  -> held, not done: a pending record outside the library folder (pendingDir), so nothing in the library
//                     changes until the user confirms (B3); confirm(id) does it, reject(id) drops it
//   confirm: false -> done at once
// Doing an action is the caller's handler: handlers[name](params, ctx) -> { object: { type, id }, before, after }.
// Every action done is recorded (log.mjs, B4) in logFile(name, params, result) — the library's _actions.jsonl, or the
// app's file for building a library.
// createActionRunner({ definition, handlers, pendingDir, logFile, now, newId }) -> { check, request, confirm, reject, pending }
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { StreamsError } from '../errors.mjs';
import { validate } from './schema.mjs';
import { appendActionLog } from './log.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function checkRequest(definition, actor, request, { handlers = {} } = {}) {
  if (!isObj(request) || typeof request.action !== 'string') return { ok: false, errors: ['a request is { action, params }'] };
  const def = Object.hasOwn(definition.actions, request.action) ? definition.actions[request.action] : null;
  if (!def) return { ok: false, errors: [`"${request.action}" is not an action of the definition`] };
  if (!def.actors.includes(actor)) return { ok: false, errors: [`"${actor}" may not do "${request.action}"`] };
  if (def.tool && typeof handlers[request.action] !== 'function') return { ok: false, errors: [`"${request.action}" is a tool used during the run, not something to hand in`] };
  const errors = validate(def.params, request.params ?? {}, 'params');
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], def };
}

export function createActionRunner({ definition, handlers = {}, pendingDir, logFile, now = () => new Date(), newId = () => `a-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}` } = {}) {
  if (!definition || !isObj(definition.actions)) throw new StreamsError('bad-argument', 'createActionRunner needs a definition');
  if (typeof pendingDir !== 'string' || pendingDir === '') throw new StreamsError('bad-argument', 'createActionRunner needs a pendingDir outside the library');
  if (typeof logFile !== 'function') throw new StreamsError('bad-argument', 'createActionRunner needs logFile(action, params, result) -> path');
  const pendingPath = (id) => join(pendingDir, `${id}.json`);

  async function execute(actor, action, params, extra = {}) {
    const handler = handlers[action];
    if (typeof handler !== 'function') return { status: 'rejected', errors: [`"${action}" cannot be done here (no handler)`] };
    let result;
    try {
      result = await handler(params, { actor, now });
    } catch (e) {
      return { status: 'failed', errors: [String(e?.message ?? e)] };
    }
    if (!isObj(result?.object) || typeof result.object.type !== 'string') return { status: 'failed', errors: [`the handler of "${action}" did not say which object it changed`] };
    const line = appendActionLog(logFile(action, params, result), { ts: now().toISOString(), actor, action, object: result.object, before: result.before, after: result.after, ...extra });
    return { status: 'done', result, record: line };
  }

  return {
    check: (actor, request) => checkRequest(definition, actor, request, { handlers }),
    async request(actor, request) {
      const c = checkRequest(definition, actor, request, { handlers });
      if (!c.ok) return { status: 'rejected', errors: c.errors };
      const params = request.params ?? {};
      if (c.def.confirm) {
        const id = newId();
        mkdirSync(pendingDir, { recursive: true });
        const rec = { id, at: now().toISOString(), actor, action: request.action, params };
        writeFileSync(pendingPath(id), JSON.stringify(rec, null, 2) + '\n', 'utf8');
        return { status: 'pending', pending: rec };
      }
      return execute(actor, request.action, params);
    },
    async confirm(id, { by = 'user' } = {}) {
      const p = pendingPath(id);
      if (!existsSync(p)) return { status: 'rejected', errors: [`no pending action "${id}"`] };
      const rec = JSON.parse(readFileSync(p, 'utf8'));
      // checked again: the definition may have changed since it was proposed
      const c = checkRequest(definition, rec.actor, { action: rec.action, params: rec.params }, { handlers });
      if (!c.ok) { unlinkSync(p); return { status: 'rejected', errors: c.errors }; }
      const out = await execute(rec.actor, rec.action, rec.params, { confirmedBy: by, pendingId: id });
      if (out.status === 'done') unlinkSync(p);
      return out;
    },
    reject(id) {
      const p = pendingPath(id);
      if (!existsSync(p)) return { status: 'rejected', errors: [`no pending action "${id}"`] };
      unlinkSync(p);
      return { status: 'dropped', id };
    },
    pending() {
      if (!existsSync(pendingDir)) return [];
      return readdirSync(pendingDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(pendingDir, f), 'utf8'))).sort((x, y) => x.at.localeCompare(y.at));
    },
  };
}
