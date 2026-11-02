// Spec v0 validation of one note file. Never touches disk.
//
// validateNote({ fileName, text, config }) ->
//   { ok, meta, body, problems: [{ code, message, line? }], warnings: [{ code, message }] }
//
// problems  = not conforming: the note is refused from the index and listed as pending.
// warnings  = still indexed, but flagged (unknown-topic:<name>, unknown-score:<key>).
// `config` may be null; then no warnings are computed.
import { basename } from 'node:path';
import { parseFrontmatter, isPlainObject } from './frontmatter.mjs';
import { topicNames, nodeIds } from './config.mjs';

export const NOTE_STATUSES = ['kept', 'authored', 'archived'];
export const REQUIRED_FIELDS = ['id', 'title', 'source', 'date', 'status', 'topics'];
const TEXT_FIELDS = ['id', 'title', 'source', 'source_name'];
const DATE_FIELDS = ['date', 'collected', 'kept'];

export function idFromFileName(fileName) {
  return basename(fileName).replace(/\.md$/i, '');
}

export function isIsoDate(v) {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function validateNote({ fileName, text, config = null }) {
  if (typeof fileName !== 'string' || fileName === '') throw new TypeError('validateNote: fileName is required');
  if (typeof text !== 'string') throw new TypeError('validateNote: text must be a string');
  const problems = [];
  const warnings = [];
  const fm = parseFrontmatter(text);
  if (!fm.ok) {
    const code = fm.error.code === 'no-frontmatter' ? 'no-frontmatter' : 'bad-frontmatter';
    problems.push({ code, message: fm.error.message, line: fm.error.line });
    return { ok: false, meta: null, body: fm.body, problems, warnings };
  }
  const meta = { ...fm.meta };

  for (const f of REQUIRED_FIELDS) {
    if (isEmpty(meta[f])) problems.push({ code: `missing:${f}`, message: `required field "${f}" is missing or empty` });
  }
  for (const f of TEXT_FIELDS) {
    if (isEmpty(meta[f])) continue;
    if (typeof meta[f] === 'number') meta[f] = String(meta[f]);
    else if (typeof meta[f] !== 'string') problems.push({ code: `bad-${f}`, message: `"${f}" must be a plain text value` });
  }
  if (typeof meta.id === 'string' && meta.id !== idFromFileName(fileName)) {
    problems.push({ code: 'id-mismatch', message: `id "${meta.id}" does not equal the file name "${idFromFileName(fileName)}"` });
  }
  for (const f of DATE_FIELDS) {
    if (isEmpty(meta[f])) continue;
    if (!isIsoDate(meta[f])) problems.push({ code: `bad-date:${f}`, message: `"${f}" must be a real calendar date in YYYY-MM-DD form, got ${JSON.stringify(meta[f])}` });
  }
  if (!isEmpty(meta.status) && !NOTE_STATUSES.includes(meta.status)) {
    problems.push({ code: 'bad-status', message: `status must be one of ${NOTE_STATUSES.join(' | ')}, got ${JSON.stringify(meta.status)}` });
  }
  if (!isEmpty(meta.topics)) {
    if (!Array.isArray(meta.topics) || !meta.topics.every((t) => typeof t === 'string' && t.trim() !== '')) {
      problems.push({ code: 'bad-topics', message: 'topics must be a non-empty list of names' });
    }
  }
  if (meta.scores !== undefined && meta.scores !== null) {
    if (!isPlainObject(meta.scores)) {
      problems.push({ code: 'bad-scores', message: 'scores must be a mapping of gate id -> { score | value, reason }' });
    } else {
      for (const [k, v] of Object.entries(meta.scores)) {
        const okShape = isPlainObject(v) && ((typeof v.score === 'number') !== (typeof v.value === 'string'));
        if (!okShape) problems.push({ code: 'bad-scores', message: `scores.${k} must be { score: <number> } or { value: <text> } (plus reason)` });
      }
    }
  }

  if (config && problems.length === 0) {
    const topics = new Set(topicNames(config));
    for (const t of meta.topics) {
      if (!topics.has(t)) warnings.push({ code: `unknown-topic:${t}`, message: `topic "${t}" is not defined in streams.json` });
    }
    if (isPlainObject(meta.scores)) {
      const nodes = new Set(nodeIds(config));
      for (const k of Object.keys(meta.scores)) {
        if (!nodes.has(k)) warnings.push({ code: `unknown-score:${k}`, message: `score key "${k}" is not a gate id in streams.json pipeline.nodes` });
      }
    }
  }

  return { ok: problems.length === 0, meta: problems.length === 0 ? meta : fm.meta, body: fm.body, problems, warnings };
}
