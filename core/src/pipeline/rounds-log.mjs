// The run record of a round: one structured line in _pipeline/rounds.jsonl (for the status page and
// the numbers) and one section in _pipeline/logs/YYYY-MM-DD.md (for a person reading the folder).
//
// appendRoundRecord(libraryDir, record) -> record
// readRounds(libraryDir)               -> [record, …]  (malformed lines skipped)
// roundLog(libraryDir, roundId)        -> record | null
// listRounds(libraryDir, n = 20)       -> newest first
// appendRoundLogMd(libraryDir, record, { day }) -> path
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const ROUNDS_FILE = join('_pipeline', 'rounds.jsonl');
export const LOGS_DIR = join('_pipeline', 'logs');

export function roundsPath(libraryDir) {
  return join(libraryDir, ROUNDS_FILE);
}

function endsWithoutNewline(path) {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size === 0) return false;
  const fd = openSync(path, 'r');
  try {
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

function appendLine(path, text) {
  mkdirSync(join(path, '..'), { recursive: true });
  const prefix = endsWithoutNewline(path) ? '\n' : '';
  appendFileSync(path, prefix + text, { encoding: 'utf8', flag: 'a' });
}

export function appendRoundRecord(libraryDir, record) {
  if (!record || typeof record.id !== 'string' || record.id === '') throw new TypeError('round record needs an id');
  appendLine(roundsPath(libraryDir), JSON.stringify(record) + '\n');
  return record;
}

export function readRounds(libraryDir) {
  const path = roundsPath(libraryDir);
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    try {
      const r = JSON.parse(raw);
      if (r && typeof r.id === 'string') out.push(r);
    } catch {
      // a broken line is skipped, never fatal
    }
  }
  return out;
}

export function roundLog(libraryDir, roundId) {
  const rounds = readRounds(libraryDir);
  for (let i = rounds.length - 1; i >= 0; i--) if (rounds[i].id === roundId) return rounds[i];
  return null;
}

export function listRounds(libraryDir, n = 20) {
  const limit = Number.isInteger(n) && n >= 0 ? n : 20;
  return readRounds(libraryDir).reverse().slice(0, limit);
}

function gateLine(id, c) {
  return `- ${id}: passed ${c.passed} · failed ${c.failed} · unscored ${c.unscored}`;
}

// The md section uses internal codes, not sentences: the desktop decides the words (V7).
export function renderRoundMd(record) {
  const c = record.counts ?? {};
  const lines = [`## ${record.id} · ${record.startedAt} → ${record.finishedAt}`, ''];
  lines.push(`- fetched ${c.fetched ?? 0} · new ${c.new ?? 0} · maybe-duplicates ${c.maybeDuplicates ?? 0}${c.old ? ` · old ${c.old}` : ''}`);
  for (const [id, g] of Object.entries(record.gates ?? {})) lines.push(gateLine(id, g));
  lines.push(`- summarized ${c.summarized ?? 0} · inbox ${c.inbox ?? 0} · verify-rejected ${c.verifyRejected ?? 0}`);
  lines.push(`- calls ${record.calls ?? 0}${record.stoppedAt ? ` · stopped-at ${record.stoppedAt}` : ''}`);
  for (const s of record.fetch ?? []) lines.push(`- source ${s.name}: ${s.status} (${s.count} / ${s.newCount} new${s.oldCount ? ` / ${s.oldCount} old` : ''})`);
  for (const u of record.unscored ?? []) lines.push(`- unscored ${u.node} ${u.reason} ${u.url}`);
  for (const p of record.problems ?? []) lines.push(`- problem ${p.code}: ${p.detail ?? ''}`);
  for (const w of record.warnings ?? []) lines.push(`- warning ${w}`);
  lines.push('');
  return lines.join('\n') + '\n';
}

export function appendRoundLogMd(libraryDir, record, { day }) {
  const path = join(libraryDir, LOGS_DIR, `${day}.md`);
  appendLine(path, renderRoundMd(record));
  return path;
}
