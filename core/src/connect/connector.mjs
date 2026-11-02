// createConnector(connection, deps) -> { kind, detect(), probe(), complete(req), models(), resolveModel(slot) }
//
// connection = { kind: 'claude-code' | 'codex' | 'api', model?, verifyModel?, command?, api?: { vendor, baseUrl?, keyRef } }
// deps       = { spawnImpl?, fetchImpl?, getKey?(keyRef), now?, tmpRoot?, timeoutMs?, env?, platform? }
// The core never stores or prints a key: it only ever calls deps.getKey at request time.
import { StreamsError } from '../errors.mjs';
import { CONNECTION_KINDS } from './types.mjs';
import { VENDORS } from './models.mjs';
import { resolveModel } from './models.mjs';
import { createClaudeCodeConnector } from './claude-code.mjs';
import { createCodexConnector } from './codex.mjs';
import { createApiConnector } from './api.mjs';

export function checkConnection(connection) {
  if (!connection || typeof connection !== 'object') throw new StreamsError('bad-connection', 'connection must be an object');
  if (!CONNECTION_KINDS.includes(connection.kind)) throw new StreamsError('bad-connection', `unknown connection kind "${connection.kind}"`);
  for (const k of ['model', 'verifyModel']) {
    if (connection[k] !== undefined && typeof connection[k] !== 'string') throw new StreamsError('bad-connection', `"${k}" must be a string`);
  }
  if (connection.kind === 'api') {
    const api = connection.api;
    if (!api || typeof api !== 'object') throw new StreamsError('bad-connection', 'api connection needs "api"');
    if (!VENDORS[api.vendor]) throw new StreamsError('bad-connection', `unknown vendor "${api.vendor}"`);
    if (api.vendor === 'custom' && (typeof api.baseUrl !== 'string' || api.baseUrl === '')) throw new StreamsError('bad-connection', 'custom vendor needs "baseUrl"');
    if (typeof api.keyRef !== 'string' || api.keyRef === '') throw new StreamsError('bad-connection', 'api connection needs "keyRef"');
    if (typeof api.key === 'string') throw new StreamsError('bad-connection', 'a key must never be stored on the connection; pass getKey(keyRef) in deps');
  }
  return connection;
}

export function createConnector(connection, deps = {}) {
  checkConnection(connection);
  let c;
  switch (connection.kind) {
    case 'claude-code': c = createClaudeCodeConnector(connection, deps); break;
    case 'codex': c = createCodexConnector(connection, deps); break;
    case 'api': c = createApiConnector(connection, deps); break;
    default: throw new StreamsError('bad-connection', `unknown connection kind "${connection.kind}"`);
  }
  return { ...c, resolveModel: (slot) => resolveModel(connection, slot) };
}
