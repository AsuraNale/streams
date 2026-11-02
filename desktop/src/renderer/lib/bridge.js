// The page's side of the preload bridge (docs/desktop.md §四). Screens call `call('methodName', …args)`:
// it resolves with the method's data, or rejects with a BridgeError whose `code` is one of the main
// process's error codes (src/main/bridge-methods.mjs ERROR_CODES) — never with a stack or a path.

export class BridgeError extends Error {
  constructor(code) {
    super(code)
    this.name = 'BridgeError'
    this.code = code
  }
}

export async function call(name, ...args) {
  const api = globalThis.streams
  const method = api && Object.hasOwn(api, name) ? api[name] : undefined
  if (typeof method !== 'function') throw new BridgeError('no_such_method')
  const reply = await method(...args)
  if (!reply || reply.ok !== true) throw new BridgeError(typeof reply?.error?.code === 'string' ? reply.error.code : 'bad_reply')
  return reply.data
}

/**
 * Listen to an event of the main process (docs/desktop.md §四「事件」): `onEvent('settings-changed', () => …)`.
 * Only the documented topics; returns the function that stops listening (call it when the screen goes away,
 * e.g. as a useEffect cleanup).
 */
export function onEvent(topic, callback) {
  const api = globalThis.streams
  if (!api || typeof api.onEvent !== 'function') throw new BridgeError('no_such_method')
  return api.onEvent(topic, callback)
}
