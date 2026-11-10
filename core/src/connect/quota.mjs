// v2 package M (docs/checks/2026-11-10-wp-m/contract.md; docs/core-api.md 5.17): what is left of the plan or the API balance of
// a connection — read, never spent. Three sources, one shape:
//
//   quota = { source: 'claude-code', at, windows: [{ id: 'five_hour' | 'seven_day', usedPercent, resetsAt }] }
//         | { source: 'codex', at, plan?, windows: [{ id: 'primary' | 'secondary', usedPercent, windowMins, resetsAt }] }
//         | { source: 'api', at, vendor, balance: [{ currency, amount }], available? }
//   at        ISO time the numbers were read (Claude Code: the call they came with — 「上次调用时」 numbers)
//   resetsAt  unix seconds, as the tools give it
//
// Every field is taken by name from an allowlist; anything else in what a tool printed (account ids, credits, reset vouchers,
// overage switches…) is never copied. Something missing or of the wrong type → no quota at all (null), never an error.
//
// Claude Code (2.1.287, seen 11-10): `-p --output-format stream-json --verbose` prints one JSON object per line; among them
//   {"type":"rate_limit_event","rate_limit_info":{…,"unifiedWindows":{"five_hour":{"utilization":0.05,"resetsAt":1794339000},
//    "seven_day":{"utilization":0.11,"resetsAt":1794603600}}}}
// Codex (0.167.0-alpha, seen 11-10): `codex app-server` → account/rateLimits/read →
//   { rateLimits: { primary: { usedPercent, windowDurationMins, resetsAt }, secondary, planType, credits, … }, accountId, … }
// API: only the vendors whose official docs give a balance endpoint (BALANCE_ENDPOINTS below; the others: docs/core-api.md 5.17).

export const QUOTA_SOURCES = Object.freeze(['claude-code', 'codex', 'api']);
// v2 package M: the two windows of Claude Code's plan, the only ones taken
export const CLAUDE_WINDOWS = Object.freeze(['five_hour', 'seven_day']);
export const CODEX_WINDOWS = Object.freeze(['primary', 'secondary']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const resets = (v) => finite(v) && v > 0 && Number.isInteger(v);
const pct = (v) => finite(v) && v >= 0 && v <= 100;
const round1 = (v) => Math.round(v * 10) / 10;
const iso = (now) => (typeof now === 'function' ? now() : new Date()).toISOString();

/** The windows of one rate_limit_event (null when its shape is not the one seen). */
function claudeWindowsOf(ev) {
  const info = isObj(ev) && ev.type === 'rate_limit_event' && isObj(ev.rate_limit_info) ? ev.rate_limit_info : null;
  const uw = info && isObj(info.unifiedWindows) ? info.unifiedWindows : null;
  if (!uw) return null;
  const windows = [];
  for (const id of CLAUDE_WINDOWS) {
    const w = uw[id];
    if (w === undefined) continue;
    if (!isObj(w) || !finite(w.utilization) || w.utilization < 0 || w.utilization > 1 || !resets(w.resetsAt)) return null;
    windows.push({ id, usedPercent: round1(w.utilization * 100), resetsAt: w.resetsAt });
  }
  return windows.length > 0 ? windows : null;
}

/**
 * Claude Code's quota from a stream-json stdout: the last well-formed rate_limit_event, or null (no event, a broken one).
 * @param {string} stdout
 * @param {() => Date} [now]
 */
export function quotaFromClaudeStream(stdout, now) {
  let last = null;
  for (const raw of String(stdout || '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{') || !line.includes('rate_limit_event')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const w = claudeWindowsOf(ev);
    if (w) last = w;
  }
  return last ? { source: 'claude-code', at: iso(now), windows: last } : null;
}

/**
 * Codex's quota from the result of account/rateLimits/read, or null. Only usedPercent / windowDurationMins / resetsAt of
 * primary and secondary, and planType; nothing else of the answer is read.
 */
export function quotaFromCodexRateLimits(result, now) {
  const rl = isObj(result) && isObj(result.rateLimits) ? result.rateLimits : null;
  if (!rl) return null;
  const windows = [];
  for (const id of CODEX_WINDOWS) {
    const w = rl[id];
    if (w === undefined || w === null) continue;
    if (!isObj(w) || !pct(w.usedPercent) || !finite(w.windowDurationMins) || w.windowDurationMins <= 0 || !resets(w.resetsAt)) return null;
    windows.push({ id, usedPercent: round1(w.usedPercent), windowMins: Math.round(w.windowDurationMins), resetsAt: w.resetsAt });
  }
  if (windows.length === 0) return null;
  const out = { source: 'codex', at: iso(now), windows };
  if (typeof rl.planType === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(rl.planType)) out.plan = rl.planType;
  return out;
}

// ---- API balances --------------------------------------------------------------------------------------------------------
// vendor → where its official balance endpoint is, and how its answer reads. Checked against the vendors' own docs 11-10
// (docs/core-api.md 5.17 lists every vendor of models.mjs VENDORS, with or without one).
const origin = (baseUrl) => { try { return new URL(baseUrl).origin; } catch { return null; } };
const amount = (v) => (finite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
const CURRENCY = /^[A-Z]{3}$/;

export const BALANCE_ENDPOINTS = Object.freeze({
  // https://api-docs.deepseek.com/api/get-user-balance — GET /user/balance on the API's origin, Authorization: Bearer
  deepseek: Object.freeze({
    url: (baseUrl) => { const o = origin(baseUrl); return o ? `${o}/user/balance` : null; },
    parse(json) {
      if (!isObj(json) || !Array.isArray(json.balance_infos)) return null;
      const balance = [];
      for (const b of json.balance_infos) {
        if (!isObj(b) || typeof b.currency !== 'string' || !CURRENCY.test(b.currency)) return null;
        const a = amount(b.total_balance);
        if (a === null) return null;
        balance.push({ currency: b.currency, amount: a });
      }
      if (balance.length === 0) return null;
      return { balance, ...(typeof json.is_available === 'boolean' ? { available: json.is_available } : {}) };
    },
  }),
  // https://platform.kimi.com/docs/api/balance — GET {base}/users/me/balance (base = https://api.moonshot.cn/v1), Bearer; CNY
  moonshot: Object.freeze({
    url: (baseUrl) => (origin(baseUrl) ? `${String(baseUrl).replace(/\/+$/, '')}/users/me/balance` : null),
    parse(json) {
      if (!isObj(json) || !isObj(json.data)) return null;
      const a = amount(json.data.available_balance);
      if (a === null) return null;
      return { balance: [{ currency: 'CNY', amount: a }], available: a > 0 };
    },
  }),
});
export const BALANCE_VENDORS = Object.freeze(Object.keys(BALANCE_ENDPOINTS));

/** Does this vendor have a balance endpoint? (false: the corner shows nothing for it) */
export const hasBalanceEndpoint = (vendor) => Object.hasOwn(BALANCE_ENDPOINTS, vendor);

/** A quota object as the desktop keeps it: the same allowlist again (a stand-in or a development file goes through it too). */
export function checkQuota(q) {
  if (!isObj(q) || !QUOTA_SOURCES.includes(q.source) || typeof q.at !== 'string' || Number.isNaN(Date.parse(q.at))) return null;
  if (q.source === 'api') {
    if (typeof q.vendor !== 'string' || !Array.isArray(q.balance) || q.balance.length === 0) return null;
    const balance = [];
    for (const b of q.balance) {
      if (!isObj(b) || typeof b.currency !== 'string' || !CURRENCY.test(b.currency) || !finite(b.amount)) return null;
      balance.push({ currency: b.currency, amount: b.amount });
    }
    return { source: 'api', at: q.at, vendor: q.vendor, balance, ...(typeof q.available === 'boolean' ? { available: q.available } : {}) };
  }
  const ids = q.source === 'claude-code' ? CLAUDE_WINDOWS : CODEX_WINDOWS;
  if (!Array.isArray(q.windows) || q.windows.length === 0) return null;
  const windows = [];
  for (const w of q.windows) {
    if (!isObj(w) || !ids.includes(w.id) || !pct(w.usedPercent) || !resets(w.resetsAt)) return null;
    const out = { id: w.id, usedPercent: w.usedPercent, resetsAt: w.resetsAt };
    if (q.source === 'codex') {
      if (!finite(w.windowMins) || w.windowMins <= 0) return null;
      out.windowMins = w.windowMins;
    }
    windows.push(out);
  }
  const out = { source: q.source, at: q.at, windows };
  if (q.source === 'codex' && typeof q.plan === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(q.plan)) out.plan = q.plan;
  return out;
}
