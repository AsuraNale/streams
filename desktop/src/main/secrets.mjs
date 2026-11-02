/**
 * Secrets on disk (docs/desktop.md §三): the API keys of the connections, each in <appData>/secrets/<name>.bin, encrypted
 * with Electron's safeStorage (Windows: DPAPI, tied to this Windows user). Nothing here is ever written in plain text,
 * logged, or handed to the page: `get` is for the main process only (the connection that sends a request). Without
 * encryption (safeStorage not available) nothing is stored: `set` throws `no_encryption`.
 *
 * Names: one secret per provider the user connects with an API key — `key-<provider>` (plan 4.9: the keys are kept by
 * provider; today only the naming is settled, the connection screens come with C2). A name must match SECRET_NAME.
 * @module desktop/main/secrets
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** `key-<provider>`: the provider id is lower-case letters, digits and hyphens (e.g. key-anthropic, key-openai-compatible). */
export const SECRET_NAME = /^key-[a-z0-9][a-z0-9-]{0,40}$/

export class SecretError extends Error {
  constructor(code, message = code) { super(message); this.code = code }
}

/**
 * @param {object} o
 * @param {string} o.dir - <appData>/secrets
 * @param {{isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string}} o.safeStorage
 */
export function createSecretStore({ dir, safeStorage }) {
  const file = name => {
    if (typeof name !== 'string' || !SECRET_NAME.test(name)) throw new SecretError('unknown_secret', `not a secret name: ${String(name)}`)
    return join(dir, `${name}.bin`)
  }
  return {
    has: name => existsSync(file(name)),
    /** The secret in plain text, or null when none is stored. Main process only. */
    get(name) {
      const f = file(name)
      if (!existsSync(f)) return null
      if (!safeStorage.isEncryptionAvailable()) throw new SecretError('no_encryption', 'safeStorage cannot decrypt on this machine now')
      return safeStorage.decryptString(readFileSync(f))
    },
    /** Encrypt and store (replacing what was there), through a temporary file and a rename. */
    set(name, value) {
      const f = file(name)
      if (typeof value !== 'string' || value === '') throw new SecretError('bad_secret', 'a secret is a non-empty string')
      if (!safeStorage.isEncryptionAvailable()) throw new SecretError('no_encryption', 'safeStorage is not available: the secret is not stored')
      mkdirSync(dir, { recursive: true })
      const tmp = `${f}.${process.pid}.tmp`
      writeFileSync(tmp, safeStorage.encryptString(value))
      renameSync(tmp, f)
    },
    remove: name => rmSync(file(name), { force: true }),
    /** The names of the secrets stored (never their values): the diagnostics say which connections hold a key. */
    list() {
      let names
      try { names = readdirSync(dir) } catch { return [] }
      return names.filter(n => n.endsWith('.bin')).map(n => n.slice(0, -4)).filter(n => SECRET_NAME.test(n)).sort()
    },
  }
}

const DOT = String.fromCodePoint(0x2022) // •

/** What the page may see of a stored key: the first three characters when they are `sk-`, then dots, the last four. */
export function keyHint(key) {
  if (typeof key !== 'string' || key.length < 8) return null
  const head = key.startsWith('sk-') ? 'sk-' : ''
  return `${head}${DOT.repeat(14)}${key.slice(-4)}`
}
