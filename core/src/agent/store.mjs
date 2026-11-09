// The main agent's files (v2 package C; docs/core-api.md 5.15; docs/design/v2/architecture.md 2.3). All under one folder,
// `agentDir` (the desktop: <appData>/agent):
//   transcript.jsonl   the conversation's record of truth, append only. One line per row:
//                        { at, turn, role: 'you' | 'agent' | 'lookup' | 'note' | 'summary', text, data? }
//                      `turn` numbers the turns from 1; every row of one turn has its number. `data`: the agent's action
//                      JSON, a lookup's request and result, the ids of the proposal cards it made, a summary's `through`.
//                      Read back line by line; a line that is not JSON or not a row is skipped and counted.
//   session.json       the session ids per connection kind, only a cache (losing it costs nothing: the transcript rebuilds the
//                      context): { <kind>: { sessionId | null, startedAt, turns, summarizedThrough } }. Missing or unreadable = {}.
//                      Written whole (a temporary file and a rename).
//   notes.jsonl        the agent's own notes (its `note` action), append only: { at, turn, text } (text ≤ NOTE_MAX).
//   usage.jsonl        every model call of the agent, the line format of a library's _pipeline/usage.jsonl.
// The empty folder the CLI connections run in for the agent (connect/session.mjs) is NOT here: it is AGENT_CWD, a folder of
// its own under the system's temporary folder (%TEMP%/streams-agent-cwd), as v1.0's library calls run under the temporary
// folder too — so no model subprocess runs inside the app data (the desktop's layout.mjs rule; contract C3 said agent/cwd,
// moved by the PM on 2026-11-09). Nothing here touches a library folder.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';

export const AGENT_DIR = 'agent';
export const TRANSCRIPT_FILE = 'transcript.jsonl';
export const SESSION_FILE = 'session.json';
export const AGENT_NOTES_FILE = 'notes.jsonl';
export const AGENT_USAGE_FILE = 'usage.jsonl';
export const AGENT_CWD_NAME = 'streams-agent-cwd';
/** The main agent's working folder for Claude Code / Codex: <tmp>/streams-agent-cwd (made with mkdirSync by the connector). */
export const agentCwd = (tmp = tmpdir()) => join(tmp, AGENT_CWD_NAME);
export const AGENT_CWD = agentCwd();
export const ROLES = Object.freeze(['you', 'agent', 'lookup', 'note', 'summary']);
export const NOTE_MAX = 1000;
export const TEXT_MAX = 100_000;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const agentPaths = (agentDir) => ({
  dir: agentDir,
  transcript: join(agentDir, TRANSCRIPT_FILE),
  session: join(agentDir, SESSION_FILE),
  notes: join(agentDir, AGENT_NOTES_FILE),
  usage: join(agentDir, AGENT_USAGE_FILE),
});

function endsWithoutNewline(path) {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size === 0) return false;
  const fd = openSync(path, 'r');
  try {
    const b = Buffer.alloc(1);
    readSync(fd, b, 0, 1, size - 1);
    return b[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

// one line at the end of a jsonl file (a torn last line is closed first, so the new one stays readable)
function appendLine(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  appendFileSync(path, (endsWithoutNewline(path) ? '\n' : '') + JSON.stringify(value) + '\n', 'utf8');
}

function readLines(path, isRow) {
  const rows = [];
  let skipped = 0;
  if (!existsSync(path)) return { rows, skipped };
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    let v;
    try { v = JSON.parse(raw); } catch { skipped++; continue; }
    if (!isRow(v)) { skipped++; continue; }
    rows.push(v);
  }
  return { rows, skipped };
}

export function isTranscriptRow(v) {
  return isObject(v) && typeof v.at === 'string' && Number.isInteger(v.turn) && v.turn >= 0 && ROLES.includes(v.role) && typeof v.text === 'string'
    && (v.data === undefined || v.data === null || typeof v.data === 'object');
}

/** One row at the end of transcript.jsonl. -> the row written */
export function appendTranscript(agentDir, { turn, role, text, data }, { now = () => new Date() } = {}) {
  if (!Number.isInteger(turn) || turn < 0) throw new StreamsError('bad-argument', 'turn must be a whole number');
  if (!ROLES.includes(role)) throw new StreamsError('bad-argument', `role must be one of ${ROLES.join(' | ')}`);
  if (typeof text !== 'string') throw new StreamsError('bad-argument', 'text must be a string');
  const row = { at: now().toISOString(), turn, role, text: text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text };
  if (data !== undefined && data !== null) row.data = data;
  appendLine(agentPaths(agentDir).transcript, row);
  return row;
}

/** -> { rows, skipped } in the order written; bad lines skipped. */
export function readTranscript(agentDir) {
  const { rows, skipped } = readLines(agentPaths(agentDir).transcript, isTranscriptRow);
  return { rows, skipped };
}

/** The number the next turn takes (1 for an empty transcript). */
export function nextTurn(rows) {
  let n = 0;
  for (const r of rows) if (r.turn > n) n = r.turn;
  return n + 1;
}

/** The newest summary row, or null. */
export function lastSummary(rows) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].role === 'summary') return rows[i];
  return null;
}

/** The turn the newest summary covers up to (0: none). */
export function summarizedThrough(rows) {
  const s = lastSummary(rows);
  return s && Number.isInteger(s.data?.through) ? s.data.through : 0;
}

// sessionId null: no live session for that kind (after a compression, or none yet), the rest still kept
const isSession = (v) => isObject(v) && ((typeof v.sessionId === 'string' && v.sessionId !== '') || v.sessionId === null);

/** The session cache: { <kind>: { sessionId, startedAt, turns, summarizedThrough } }; missing, unreadable, bad → {}. */
export function readSessions(agentDir) {
  const path = agentPaths(agentDir).session;
  if (!existsSync(path)) return {};
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
  if (!isObject(data)) return {};
  const out = {};
  for (const [kind, v] of Object.entries(data)) {
    if (!isSession(v)) continue;
    out[kind] = {
      sessionId: v.sessionId,
      startedAt: typeof v.startedAt === 'string' ? v.startedAt : null,
      turns: Number.isInteger(v.turns) && v.turns >= 0 ? v.turns : 0,
      summarizedThrough: Number.isInteger(v.summarizedThrough) && v.summarizedThrough >= 0 ? v.summarizedThrough : 0,
    };
  }
  return out;
}

/** The cache for one kind replaced (null: dropped); the whole file written through a temporary file and a rename. */
export function writeSession(agentDir, kind, value) {
  const all = readSessions(agentDir);
  if (value === null) delete all[kind];
  else all[kind] = value;
  const path = agentPaths(agentDir).session;
  mkdirSync(agentDir, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
  return all;
}

const isNoteRow = (v) => isObject(v) && typeof v.at === 'string' && typeof v.text === 'string';

/** The agent's `note` action: one line (the text trimmed and cut to NOTE_MAX). -> the line, or null for an empty note */
export function appendAgentNote(agentDir, text, { turn = 0, now = () => new Date() } = {}) {
  if (typeof text !== 'string') throw new StreamsError('bad-argument', 'a note is a string');
  const t = text.trim();
  if (t === '') return null;
  const chars = [...t];
  const line = { at: now().toISOString(), turn, text: chars.length > NOTE_MAX ? chars.slice(0, NOTE_MAX).join('') : t };
  appendLine(agentPaths(agentDir).notes, line);
  return line;
}

/** The newest `limit` notes, oldest first. */
export function readAgentNotes(agentDir, { limit = 5 } = {}) {
  const { rows } = readLines(agentPaths(agentDir).notes, isNoteRow);
  return limit > 0 ? rows.slice(-limit) : rows;
}
