// Minimal YAML front matter reader/writer for note headers (spec v0).
//
// Supported subset (on purpose, no third-party YAML):
//   - scalars: plain, "double-quoted" (with \" \\ \n \r \t), 'single-quoted' ('' escape)
//   - plain numbers (-?\d+(\.\d+)?) become Number, true/false become Boolean,
//     null/~ become null; everything else stays a string (dates stay strings)
//   - trailing "# comment" on plain values, and whole-line comments
//   - inline lists  [a, b]        (items are scalars)
//   - block lists   - a / - b     (items are scalars)
//   - nested mappings by two-space indentation
//   - flow mappings { k: v, k2: v2 }   (values are scalars)
//
// parseFrontmatter(text) -> { ok, meta, body, error?: { code, line, message } }
//   error.code: 'no-frontmatter' | 'unclosed' | 'yaml'
// serializeFrontmatter(meta) -> string   ("---\n...\n---\n", fixed key order)

export const KEY_ORDER = ['id', 'title', 'source', 'source_name', 'date', 'collected', 'kept', 'status', 'topics', 'scores'];

const DELIM = '---';
const KEY_RE = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

class YamlError extends Error {
  constructor(line, message) {
    super(message);
    this.line = line;
  }
}

export function parseFrontmatter(text) {
  if (typeof text !== 'string') throw new TypeError('parseFrontmatter expects a string');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  if (lines[0] !== DELIM) {
    return { ok: false, meta: null, body: text, error: { code: 'no-frontmatter', line: 1, message: 'first line is not "---"' } };
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === DELIM) { close = i; break; }
  }
  if (close === -1) {
    return { ok: false, meta: null, body: text, error: { code: 'unclosed', line: lines.length, message: 'front matter opened at line 1 is never closed with "---"' } };
  }
  const body = lines.slice(close + 1).join('\n');
  try {
    const meta = parseYamlMapping(lines.slice(1, close), 2);
    return { ok: true, meta, body };
  } catch (e) {
    if (e instanceof YamlError) {
      return { ok: false, meta: null, body, error: { code: 'yaml', line: e.line, message: e.message } };
    }
    throw e;
  }
}

// ---------------------------------------------------------------- parser

function parseYamlMapping(yamlLines, firstLineNo) {
  const entries = [];
  yamlLines.forEach((raw, i) => {
    const n = firstLineNo + i;
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) return;
    const m = /^([ \t]*)(.*)$/.exec(raw);
    if (m[1].includes('\t')) throw new YamlError(n, 'tab used for indentation');
    entries.push({ n, indent: m[1].length, text: m[2].trimEnd() });
  });
  if (entries.length === 0) return {};
  if (entries[0].indent !== 0) throw new YamlError(entries[0].n, 'unexpected indent at top level');
  if (isListItem(entries[0].text)) throw new YamlError(entries[0].n, 'front matter must be a mapping, not a list');
  const { value, pos } = parseMap(entries, 0, 0);
  if (pos !== entries.length) throw new YamlError(entries[pos].n, 'unexpected content');
  return value;
}

function isListItem(text) {
  return text === '-' || text.startsWith('- ');
}

function parseMap(entries, pos, indent) {
  const obj = {};
  while (pos < entries.length) {
    const e = entries[pos];
    if (e.indent < indent) break;
    if (e.indent > indent) throw new YamlError(e.n, 'unexpected indent');
    if (isListItem(e.text)) throw new YamlError(e.n, 'list item where a "key: value" was expected');
    const m = KEY_RE.exec(e.text);
    if (!m) throw new YamlError(e.n, 'expected "key: value"');
    const key = m[1];
    if (Object.hasOwn(obj, key)) throw new YamlError(e.n, `duplicate key "${key}"`);
    const rest = (m[2] ?? '').trim();
    pos++;
    let value;
    if (rest === '' || rest.startsWith('#')) {
      const next = entries[pos];
      if (next && next.indent > indent) {
        const r = isListItem(next.text) ? parseList(entries, pos, next.indent) : parseMap(entries, pos, next.indent);
        value = r.value; pos = r.pos;
      } else if (next && next.indent === indent && isListItem(next.text)) {
        const r = parseList(entries, pos, indent);
        value = r.value; pos = r.pos;
      } else {
        value = null;
      }
    } else {
      value = parseInline(rest, e.n);
    }
    obj[key] = value;
  }
  return { value: obj, pos };
}

function parseList(entries, pos, indent) {
  const arr = [];
  while (pos < entries.length) {
    const e = entries[pos];
    if (e.indent < indent) break;
    if (e.indent > indent) throw new YamlError(e.n, 'nested structures inside list items are not supported');
    if (!isListItem(e.text)) break;
    const rest = e.text === '-' ? '' : e.text.slice(2).trim();
    arr.push(rest === '' ? null : parseInline(rest, e.n));
    pos++;
  }
  return { value: arr, pos };
}

function parseInline(s, n) {
  if (s.startsWith('[')) return parseFlowSeq(s, n);
  if (s.startsWith('{')) return parseFlowMap(s, n);
  return parseScalarWithComment(s, n);
}

// Reads one scalar from the start of `s`; returns { value, rest }.
function readScalar(s, n, stopChars) {
  if (s[0] === '"') {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') {
        const e = s[++i];
        if (e === '"' || e === '\\' || e === '/') out += e;
        else if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else throw new YamlError(n, `unknown escape "\\${e ?? ''}" in double-quoted string`);
      } else if (c === '"') {
        return { value: out, rest: s.slice(i + 1) };
      } else {
        out += c;
      }
    }
    throw new YamlError(n, 'unterminated double-quoted string');
  }
  if (s[0] === "'") {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") { out += "'"; i++; continue; }
        return { value: out, rest: s.slice(i + 1) };
      }
      out += s[i];
    }
    throw new YamlError(n, 'unterminated single-quoted string');
  }
  let end = s.length;
  for (let i = 0; i < s.length; i++) {
    if (stopChars.includes(s[i])) { end = i; break; }
    if (s[i] === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) { end = i; break; }
  }
  return { value: plainScalar(s.slice(0, end).trim()), rest: s.slice(end) };
}

function plainScalar(t) {
  if (t === '' || t === 'null' || t === '~') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (NUMBER_RE.test(t)) return Number(t);
  return t;
}

function parseScalarWithComment(s, n) {
  const { value, rest } = readScalar(s, n, '');
  const tail = rest.trim();
  if (tail !== '' && !tail.startsWith('#')) throw new YamlError(n, `unexpected text after value: "${tail}"`);
  return value;
}

function parseFlowSeq(s, n) {
  const { inner, tail } = flowBody(s, n, '[', ']');
  const items = splitFlow(inner, n);
  const out = items.map((item) => {
    const t = item.trim();
    if (t === '') throw new YamlError(n, 'empty item in inline list');
    if (t.startsWith('[') || t.startsWith('{')) throw new YamlError(n, 'nested collections inside an inline list are not supported');
    const { value, rest } = readScalar(t, n, ',]');
    if (rest.trim() !== '') throw new YamlError(n, `unexpected text in inline list: "${rest.trim()}"`);
    return value;
  });
  checkTail(tail, n);
  return out;
}

function parseFlowMap(s, n) {
  const { inner, tail } = flowBody(s, n, '{', '}');
  const obj = {};
  for (const item of splitFlow(inner, n)) {
    const t = item.trim();
    if (t === '') throw new YamlError(n, 'empty entry in flow mapping');
    const m = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$/.exec(t);
    if (!m) throw new YamlError(n, `expected "key: value" inside { }, got "${t}"`);
    if (Object.hasOwn(obj, m[1])) throw new YamlError(n, `duplicate key "${m[1]}" in flow mapping`);
    const v = (m[2] ?? '').trim();
    if (v.startsWith('[') || v.startsWith('{')) throw new YamlError(n, 'nested collections inside a flow mapping are not supported');
    const { value, rest } = readScalar(v, n, ',}');
    if (rest.trim() !== '') throw new YamlError(n, `unexpected text in flow mapping: "${rest.trim()}"`);
    obj[m[1]] = value;
  }
  checkTail(tail, n);
  return obj;
}

// Finds the matching closing bracket (quote-aware) and returns inner text + text after it.
function flowBody(s, n, open, close) {
  let quote = null;
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (quote === '"' && c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === close) return { inner: s.slice(1, i), tail: s.slice(i + 1) };
  }
  throw new YamlError(n, `"${open}" is never closed with "${close}"`);
}

function splitFlow(inner, n) {
  if (inner.trim() === '') return [];
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (quote === '"' && c === '\\') cur += inner[++i] ?? '';
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") { quote = c; cur += c; }
    else if (c === ',') { parts.push(cur); cur = ''; }
    else cur += c;
  }
  if (quote) throw new YamlError(n, 'unterminated quoted string');
  parts.push(cur);
  return parts;
}

function checkTail(tail, n) {
  const t = tail.trim();
  if (t !== '' && !t.startsWith('#')) throw new YamlError(n, `unexpected text after collection: "${t}"`);
}

// ---------------------------------------------------------------- serializer

export function serializeFrontmatter(meta) {
  if (!isPlainObject(meta)) throw new TypeError('serializeFrontmatter expects a plain object');
  const known = KEY_ORDER.filter((k) => meta[k] !== undefined);
  const extra = Object.keys(meta).filter((k) => !KEY_ORDER.includes(k) && meta[k] !== undefined);
  const lines = [DELIM];
  for (const key of [...known, ...extra]) emitBlockEntry(lines, key, meta[key], 0);
  lines.push(DELIM);
  return lines.join('\n') + '\n';
}

function emitBlockEntry(lines, key, value, indent) {
  checkKey(key);
  const pad = ' '.repeat(indent);
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) { lines.push(`${pad}${key}: {}`); return; }
    lines.push(`${pad}${key}:`);
    for (const k of keys) {
      const v = value[k];
      if (isPlainObject(v)) { checkKey(k); lines.push(`${pad}  ${k}: ${flowMap(v)}`); }
      else emitBlockEntry(lines, k, v, indent + 2);
    }
    return;
  }
  if (Array.isArray(value)) { lines.push(`${pad}${key}: ${flowSeq(value)}`); return; }
  lines.push(`${pad}${key}: ${scalarToYaml(value, 'block')}`);
}

function flowMap(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return '{}';
  const parts = keys.map((k) => {
    checkKey(k);
    const v = obj[k];
    if (isPlainObject(v) || Array.isArray(v)) throw new TypeError(`flow mapping value "${k}" must be a scalar`);
    return `${k}: ${scalarToYaml(v, 'flow')}`;
  });
  return `{ ${parts.join(', ')} }`;
}

function flowSeq(arr) {
  if (arr.length === 0) return '[]';
  return `[${arr.map((v) => {
    if (isPlainObject(v) || Array.isArray(v)) throw new TypeError('inline list items must be scalars');
    return scalarToYaml(v, 'flow');
  }).join(', ')}]`;
}

function checkKey(key) {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) throw new TypeError(`invalid YAML key "${key}"`);
}

const RESERVED_WORDS = new Set(['true', 'false', 'null', '~', 'yes', 'no', 'on', 'off']);

function scalarToYaml(v, ctx) {
  if (v === null) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('cannot serialize non-finite number');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v !== 'string') throw new TypeError(`cannot serialize value of type ${typeof v}`);
  return needsQuote(v, ctx) ? quote(v) : v;
}

function needsQuote(s, ctx) {
  if (s === '') return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/[\n\r\t]/.test(s)) return true;
  if (/^[[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/^-( |$)/.test(s) || /^[?:]( |$)/.test(s)) return true;
  if (s.includes(': ') || s.includes(' #') || s.endsWith(':')) return true;
  if (RESERVED_WORDS.has(s.toLowerCase())) return true;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return true;
  if (ctx === 'flow' && /[,[\]{}]/.test(s)) return true;
  return false;
}

function quote(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

// ---------------------------------------------------------------- bytes

// splitNoteBytes(bytes) -> { bom, head, body }   three Buffers whose concatenation is the input, byte for byte
//   bom   the UTF-8 byte-order mark (EF BB BF) when the file starts with one, else empty
//   head  the front matter with its closing "---" line and that line's line break, else empty
//   body  everything after it: the whole file (after the mark) when there is no closed front matter
// The same line rule as parseFrontmatter: lines end at \r?\n, the first line must be exactly "---", the next line that is
// exactly "---" closes. Bytes are never decoded and re-encoded (latin1 maps each byte to one character), so a line break,
// a missing final newline or a non-UTF-8 byte in the body is kept as it is.
export function splitNoteBytes(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const bomLen = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
  const s = buf.toString('latin1', bomLen);
  const lineEnd = /\r?\n/g;
  let pos = 0;
  let first = true;
  let headEnd = 0;
  for (;;) {
    lineEnd.lastIndex = pos;
    const m = lineEnd.exec(s);
    const end = m ? m.index : s.length;
    const next = m ? m.index + m[0].length : s.length;
    const line = s.slice(pos, end);
    if (first) {
      if (line !== DELIM) break;
      first = false;
    } else if (line === DELIM) {
      headEnd = next;
      break;
    }
    if (!m) break;
    pos = next;
  }
  return { bom: buf.subarray(0, bomLen), head: buf.subarray(bomLen, bomLen + headEnd), body: buf.subarray(bomLen + headEnd) };
}
