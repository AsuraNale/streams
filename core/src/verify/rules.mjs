// Rule items of the verification layer (product spec 4.11, core-api 4.3): deterministic checks
// that cost zero model calls.
//
// checkRule(rule, output, { source, candidateIds }) -> { passed, evidence }
//
// `rule` is "<op>:<arg>". `output` is a string or an object:
//   text ops   contains · regex · not_regex · min_words · max_words
//              run on the string itself, or on JSON.stringify(object)
//   json ops   json_keys · json_range · json_enum · quote_in_source · ids_in_set
//              json_nonempty · json_count · max_chars
//              read fields of the object; a string is JSON.parse'd first (unparseable = failed)
// An unknown op, a bad argument or a bad pattern never throws: it is a failed check with the
// reason in `evidence`. Evidence strings are internal (the desktop layer decides what to show).
//
// countWords(text): whitespace-separated tokens, each run of Han characters counts one per character.

export const RULE_OPS = [
  'contains', 'regex', 'not_regex', 'min_words', 'max_words',
  'json_keys', 'json_range', 'json_enum', 'quote_in_source', 'ids_in_set',
  'json_nonempty', 'json_count', 'max_chars',
];

const TEXT_OPS = ['contains', 'regex', 'not_regex', 'min_words', 'max_words'];

const WORD_UNIT = /\p{Script=Han}|[^\s\p{Script=Han}]+/gu;

export function countWords(text) {
  if (typeof text !== 'string') return 0;
  let n = 0;
  for (const token of text.split(/\s+/u)) {
    if (token === '') continue;
    n += token.match(WORD_UNIT)?.length ?? 0;
  }
  return n;
}

export function parseRule(rule) {
  if (typeof rule !== 'string' || rule === '') return null;
  const i = rule.indexOf(':');
  if (i < 0) return { op: rule, arg: '' };
  return { op: rule.slice(0, i), arg: rule.slice(i + 1) };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fail(evidence) {
  return { passed: false, evidence };
}

function pass(evidence) {
  return { passed: true, evidence };
}

function asText(output) {
  if (typeof output === 'string') return output;
  if (output === undefined) return '';
  return JSON.stringify(output);
}

// -> { data } or { error }
function asObject(output) {
  if (isPlainObject(output)) return { data: output };
  if (typeof output !== 'string') return { error: 'output is not a JSON object' };
  let data;
  try {
    data = JSON.parse(output);
  } catch {
    return { error: 'output is not valid JSON' };
  }
  if (!isPlainObject(data)) return { error: 'output is not a JSON object' };
  return { data };
}

function toInt(s) {
  if (!/^-?\d+$/.test(String(s).trim())) return null;
  return Number.parseInt(s, 10);
}

function toNum(s) {
  if (String(s).trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function show(v) {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

function charLength(s) {
  return [...s].length;
}

function checkText(op, arg, text) {
  switch (op) {
    case 'contains': {
      if (arg === '') return fail('contains: empty argument');
      const ok = text.toLowerCase().includes(arg.toLowerCase());
      return ok ? pass(`found ${show(arg)}`) : fail(`not found: ${show(arg)}`);
    }
    case 'regex':
    case 'not_regex': {
      let re;
      try {
        re = new RegExp(arg, 'imu');
      } catch {
        return fail(`invalid pattern: ${show(arg)}`);
      }
      const m = re.exec(text);
      if (op === 'regex') return m ? pass(`matched ${show(m[0])}`) : fail(`no match for /${arg}/`);
      return m ? fail(`forbidden match: ${show(m[0])}`) : pass(`no match for /${arg}/`);
    }
    case 'min_words':
    case 'max_words': {
      const n = toInt(arg);
      if (n === null || n < 0) return fail(`${op}: bad argument ${show(arg)}`);
      const words = countWords(text);
      const ok = op === 'min_words' ? words >= n : words <= n;
      const ev = `${words} words (${op === 'min_words' ? 'need >=' : 'allow <='} ${n})`;
      return ok ? pass(ev) : fail(ev);
    }
    default:
      return fail(`unknown rule op "${op}"`);
  }
}

function checkJson(op, arg, data, { source, candidateIds }) {
  switch (op) {
    case 'json_keys': {
      const keys = arg.split(',').map((k) => k.trim()).filter(Boolean);
      if (keys.length === 0) return fail('json_keys: empty argument');
      const missing = keys.filter((k) => !(k in data));
      return missing.length === 0 ? pass('all keys present') : fail(`missing keys: ${missing.join(', ')}`);
    }
    case 'json_range': {
      const [field, loS, hiS] = arg.split(',').map((s) => s.trim());
      const lo = toNum(loS);
      const hi = toNum(hiS);
      if (!field || lo === null || hi === null) return fail(`json_range: bad argument ${show(arg)}`);
      const v = data[field];
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`${field} is not a number: ${show(v)}`);
      return v >= lo && v <= hi ? pass(`${field}=${v} in [${lo},${hi}]`) : fail(`${field}=${v} not in [${lo},${hi}]`);
    }
    case 'json_enum': {
      const i = arg.indexOf(',');
      const field = i < 0 ? arg.trim() : arg.slice(0, i).trim();
      const allowed = i < 0 ? [] : arg.slice(i + 1).split('|').map((s) => s.trim()).filter(Boolean);
      if (!field || allowed.length === 0) return fail(`json_enum: bad argument ${show(arg)}`);
      const v = data[field];
      if (typeof v !== 'string') return fail(`${field} is not a string: ${show(v)}`);
      return allowed.includes(v) ? pass(`${field}=${show(v)}`) : fail(`${field}=${show(v)} not one of ${allowed.join('|')}`);
    }
    case 'quote_in_source': {
      const field = arg.trim();
      if (!field) return fail('quote_in_source: empty argument');
      const v = data[field];
      if (typeof v !== 'string' || v === '') return fail(`${field} is empty`);
      if (typeof source !== 'string' || source === '') return fail('no source material');
      return source.includes(v) ? pass(`${field} found verbatim in source`) : fail(`${field} not found verbatim in source: ${show(v)}`);
    }
    case 'ids_in_set': {
      const field = arg.trim();
      if (!field) return fail('ids_in_set: empty argument');
      const v = data[field];
      if (v === undefined || v === null) return fail(`${field} is missing`);
      const ids = Array.isArray(v) ? v : [v];
      const set = new Set((Array.isArray(candidateIds) ? candidateIds : []).map(String));
      const bad = ids.filter((id) => !set.has(String(id)));
      return bad.length === 0 ? pass(`${ids.length} ids in candidate set`) : fail(`ids not in candidate set: ${bad.map(String).join(', ')}`);
    }
    case 'json_nonempty': {
      const field = arg.trim();
      if (!field) return fail('json_nonempty: empty argument');
      const v = data[field];
      const empty = v === undefined || v === null
        || (typeof v === 'string' && v.trim() === '')
        || (Array.isArray(v) && v.length === 0)
        || (isPlainObject(v) && Object.keys(v).length === 0);
      return empty ? fail(`${field} is empty`) : pass(`${field} is non-empty`);
    }
    case 'json_count': {
      const [field, nS] = arg.split(',').map((s) => s.trim());
      const n = toInt(nS);
      if (!field || n === null || n < 0) return fail(`json_count: bad argument ${show(arg)}`);
      const v = data[field];
      if (!Array.isArray(v)) return fail(`${field} is not an array: ${show(v)}`);
      return v.length === n ? pass(`${field} has ${n} items`) : fail(`${field} has ${v.length} items (need ${n})`);
    }
    case 'max_chars': {
      const [field, nS] = arg.split(',').map((s) => s.trim());
      const n = toInt(nS);
      if (!field || n === null || n < 0) return fail(`max_chars: bad argument ${show(arg)}`);
      const v = data[field];
      if (v === undefined || v === null) return fail(`${field} is missing`);
      const len = charLength(typeof v === 'string' ? v : JSON.stringify(v));
      return len <= n ? pass(`${field} has ${len} chars (allow <= ${n})`) : fail(`${field} has ${len} chars (allow <= ${n})`);
    }
    default:
      return fail(`unknown rule op "${op}"`);
  }
}

export function checkRule(rule, output, { source = '', candidateIds = [] } = {}) {
  const parsed = parseRule(rule);
  if (!parsed) return fail('rule is not a string');
  const { op, arg } = parsed;
  if (!RULE_OPS.includes(op)) return fail(`unknown rule op "${op}"`);
  if (TEXT_OPS.includes(op)) return checkText(op, arg, asText(output));
  const { data, error } = asObject(output);
  if (error) return fail(error);
  return checkJson(op, arg, data, { source, candidateIds });
}
