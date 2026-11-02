/**
 * The main process's own requests, sent through the proxy named in the environment
 * (HTTPS_PROXY / HTTP_PROXY, NO_PROXY), with Node's own proxy support — the one the key check switches on with
 * NODE_USE_ENV_PROXY=1 (keycheck.mjs), here per request through an agent, so nothing else in the main process changes.
 * Loopback never goes through the proxy (NO_PROXY always has 127.0.0.1, localhost, ::1 added). Without a
 * proxy variable the request goes out directly. ALL_PROXY is not read (Node's proxy support does not know it).
 *
 *   const fetchImpl = envProxyFetch()      a fetch-shaped function, used by the update check (services/update.mjs):
 *   await fetchImpl(url, { method, headers, signal })  →  { status, text: async () => string }
 *
 *   const open = envProxyOpen()            a streamed GET for a download (services/update.mjs: the new version's setup
 *                                          program): the same proxy agents, the answer not read here
 *   await open(url, { method, headers, signal })  →  { status, headers, body }   (body: the response stream)
 *
 * envProxyFetch reads the answer up to `maxBytes`; more is a failure (a RangeError). An aborted request rejects with an
 * AbortError; any other failure rejects with the error Node gives (its message names no header: the caller logs only a
 * kind). Neither follows a redirect: the caller decides.
 * @module desktop/main/services/env-proxy-fetch
 */

import http from 'node:http'
import https from 'node:https'

const NAMES = /^(https?_proxy|no_proxy)$/i
const LOOPBACK = ['127.0.0.1', 'localhost', '::1']

/** The proxy variables of an environment, upper-case, with the loopback names added to NO_PROXY; {} without a proxy. */
export function proxyEnvOf(env = process.env) {
  const out = {}
  for (const [k, v] of Object.entries(env ?? {})) {
    if (!NAMES.test(k) || typeof v !== 'string' || v.trim() === '') continue
    const name = k.toUpperCase()
    if (!Object.hasOwn(out, name)) out[name] = v.trim()
  }
  if (!out.HTTP_PROXY && !out.HTTPS_PROXY) return {}
  const bypass = (out.NO_PROXY ?? '').split(',').map(s => s.trim()).filter(Boolean)
  for (const host of LOOPBACK) if (!bypass.includes(host)) bypass.push(host)
  out.NO_PROXY = bypass.join(',')
  return out
}

/** One agent per protocol, each with the environment's proxy settings. */
function agentsFor(env) {
  const proxyEnv = proxyEnvOf(env)
  return { 'http:': new http.Agent({ proxyEnv }), 'https:': new https.Agent({ proxyEnv }) }
}

/** The library for a URL's protocol, or a TypeError (only http and https go out). */
function libOf(target) {
  if (target.protocol === 'https:') return https
  if (target.protocol === 'http:') return http
  throw new TypeError(`not an http(s) address: ${target.protocol}`)
}

/**
 * @param {object} [o]
 * @param {Record<string, string|undefined>} [o.env] - where the proxy variables are read (the app's own environment)
 * @param {number} [o.maxBytes] - the most of an answer that is read (64 KiB)
 */
export function envProxyFetch({ env = process.env, maxBytes = 64 * 1024 } = {}) {
  const agents = agentsFor(env)
  return function request(url, { method = 'GET', headers = {}, signal } = {}) {
    return new Promise((resolve, reject) => {
      const target = new URL(url)
      let lib
      try { lib = libOf(target) } catch (err) { reject(err); return }
      let failure = null
      const req = lib.request(target, { method, headers, agent: agents[target.protocol], signal }, res => {
        const chunks = []
        let size = 0
        res.on('data', chunk => {
          size += chunk.length
          if (size > maxBytes) { failure = new RangeError('the answer is too long'); req.destroy(failure); return }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({ status: res.statusCode ?? 0, text: async () => body })
        })
        res.on('error', err => reject(failure ?? err))
        // cut off (aborted, too long, the connection gone) before its end: a failure, not a short answer
        res.on('close', () => { if (!res.complete) reject(failure ?? Object.assign(new Error('the answer was cut off'), { name: signal?.aborted ? 'AbortError' : 'Error' })) })
      })
      req.on('error', err => reject(failure ?? err))
      req.end()
    })
  }
}

/**
 * A streamed request: resolves when the answer's head has come, with the body still to read. The body carries a quiet
 * 'error' listener (an aborted download must not take the process down); the caller listens for 'data', 'end', 'error'
 * and 'close' itself, and checks `body.complete` at 'close'.
 * @param {object} [o]
 * @param {Record<string, string|undefined>} [o.env] - where the proxy variables are read
 */
export function envProxyOpen({ env = process.env } = {}) {
  const agents = agentsFor(env)
  return function open(url, { method = 'GET', headers = {}, signal } = {}) {
    return new Promise((resolve, reject) => {
      const target = new URL(url)
      let lib
      try { lib = libOf(target) } catch (err) { reject(err); return }
      const req = lib.request(target, { method, headers, agent: agents[target.protocol], signal }, res => {
        res.on('error', () => { /* the caller sees it through its own listeners or `complete` */ })
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res })
      })
      req.on('error', reject)
      req.end()
    })
  }
}
