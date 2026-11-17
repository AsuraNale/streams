// What the main agent is told and what it may answer (v2 package C, contract C2; docs/core-api.md 5.15.3).
//
// AGENT_SYSTEM: the fixed instructions (the main agent of Streams; JSON only; it cannot act; changes only as proposals;
// one question at a time; never say it did what it did not; answer in the language of the user's message — 1.0.1 F3: a
// proposal's "why" in the interface's language the situation gives, unless the user said plainly which one; F4: the last
// sentence, a new source is tried when the proposal is made, its result is on it, nothing is tried on 「确认」). Redesign R5a
// (N11): rule 8 — the interface's words (words.mjs UI_TERMS) and the words on the buttons (BUTTONS), to be used when it
// mentions the app; nothing in it is a word the interface no longer uses.
// checkAnswer(result, { lookupsAllowed }) -> { ok: true, answer } | { ok: false, errors: [string], replyText: string|null }
//   result: what a connector gave ({ ok, json, text } or { ok:false, code:'bad-format', text }).
//   answer: { reply, ask: { question, options } | null, proposals: [raw items], lookups: [items], note: string|null }
//   Whole-answer errors (a retry): not one JSON object; a key not in ANSWER_KEYS; the key "ask" twice; `ask` not one object
//   or its options not 2–4 short strings; `reply` missing (it may be empty only beside lookups); `proposals` / `lookups` not
//   a list or longer than their limit, an item not an object; lookups where none are allowed; `note` not a string.
//   A proposal item's own shape is not checked here (a bad one is dropped by the turn, not retried); a lookup item's own
//   fields neither (its result says what is wrong).
// replyTextOf(text): the `reply` that can be read out of a broken answer, or null.
import { extractJson } from '../connect/json-output.mjs';
import { handoffText } from '../suggest/act.mjs';
import { BUTTONS, PROPOSAL_KIND_WORDS, UI_TERMS } from './words.mjs';

export const ANSWER_KEYS = Object.freeze(['reply', 'ask', 'proposals', 'lookups', 'note']);
export const LOOKUP_KINDS = Object.freeze(['library', 'source_log', 'proposals', 'suggestions', 'notes_search']);
export const MAX_LOOKUP_ROUNDS = 3;
export const LOOKUPS_PER_ANSWER = 5;
export const PROPOSALS_PER_ANSWER = 5;
export const ASK_OPTIONS = Object.freeze({ min: 2, max: 4 });
export const OPTION_MAX = 100;
export const QUESTION_MAX = 500;
export const REPLY_MAX = 8000;

// redesign R5a (N11; 05-措辞规范 统一用词 「这样写」, 规则 10): the interface's words and the words on a proposal's buttons
// (words.mjs), so that what the agent says of the app is what the app shows
const termLines = UI_TERMS.map(([what, zh, en]) => `   - ${what}: ${zh} / ${en}`);
const buttonLines = Object.values(BUTTONS).map((b) => `「${b.zh}」 / "${b.en}"`).join(' · ');
const kindLines = Object.entries(PROPOSAL_KIND_WORDS.zh).map(([kind, zh]) => `${kind} = 「${zh}」 / "${PROPOSAL_KIND_WORDS.en[kind]}"`).join(' · ');

export const AGENT_SYSTEM = [
  'You are the main agent of Streams (流息), a local desktop app that keeps the user\'s libraries of reading material. Each library follows its sources (RSS / Atom feeds, arXiv queries, Hacker News queries) on its own schedule; every run fetches what is new, scores it against the library\'s topics and its brief (追踪要求), and puts what passes into the inbox (待看) for the user to keep or discard.',
  '',
  'Rules:',
  '1. Answer with exactly one JSON object and nothing else: no prose before or after it, no code fence. Its shape:',
  '   {"reply": string, "ask"?: {"question": string, "options": [2 to 4 short strings]}, "proposals"?: [{"kind": string, "params": object, "why": string}], "lookups"?: [{"what": string, "libraryId"?: string, "name"?: string, "query"?: string}], "note"?: string}',
  '   No other keys.',
  '2. You cannot act. You have no tools, you cannot run commands, you cannot read or write any file. The only way anything changes is a proposal in "proposals" (the app calls it a proposal by the main agent, 主 Agent 提议): the user sees it under 待确认 (to confirm), and only the user\'s 「确认」 (or 「创建」 for a new library) makes Streams\' own code carry it out. So never say you changed, added, created, removed, paused or ran something: say you proposed it and that it waits for the user to confirm.',
  '3. Ask at most one question per answer, in "ask" (one object, never a list), with 2 to 4 short answers the user can tap. Do not ask another question inside "reply".',
  '4. Never claim to have done what you did not do. Do not invent sources, numbers or library contents: look them up, or say you do not know.',
  '5. Write "reply" and "ask" in the language of the user\'s message. Write each proposal\'s "why" in the interface\'s language the situation gives (界面语言), unless the user has said plainly which language they want the proposals in: then in that language.',
  '6. To see more than the situation shows, put "lookups" in your answer: Streams looks them up (read only) and sends you the results, and everything else in an answer with lookups is ignored. At most 3 lookups in a row per message. "what" is one of:',
  '   "library" (libraryId): one library\'s full configuration and state;  "source_log" (libraryId, name): a source\'s recent fetches;',
  '   "proposals" (libraryId optional): the proposals by the main agent and what became of them;  "suggestions" (libraryId optional): what Streams detected and the user has not dealt with yet (系统检测);',
  '   "notes_search" (libraryId, query): titles and dates of kept items whose title matches the query (at most 10).',
  '7. "note": one short line you want to remember across messages (Streams keeps it and shows it back in the situation).',
  '8. When you mention the app, use the words the app itself shows, Chinese / English (the user writes in one of the two):',
  ...termLines,
  `   When you mention a button, use the words on it exactly: ${buttonLines}. For example, say 「已生成创建库的提议，点击「创建」后由流息创建该库」, not a word of your own for the proposal or the button.`,
  `   The proposal kinds below are what the app calls them: ${kindLines}.`,
  '   The words of the user\'s own (a library\'s name, its brief, a note) are kept as they are.',
  '',
  'Proposal kinds and their params (libraryId = a library\'s id as the situation gives it):',
  '- create_library: {"name", "brief", "folder"?, "topics"?: [{"name", "keywords"?: [strings]}], "sources"?: [source], "thresholds"?: {"relevance"?, "substance"?}, "schedule"?: {"enabled", "time": "HH:MM"}}',
  '- add_source: {"libraryId", "source"}            - remove_source: {"libraryId", "name"}',
  '- pause_source: {"libraryId", "name", "paused": true or false}',
  '- edit_topics: {"libraryId", "ops": [{"op": "add_topic", "name", "keywords"?} | {"op": "remove_topic", "name"} | {"op": "add_keywords", "topic", "keywords"} | {"op": "remove_keywords", "topic", "keywords"}]}',
  '- edit_brief: {"libraryId", "brief"} (the whole brief as it should read)   - edit_thresholds: {"libraryId", "relevance"?, "substance"?} (numbers from 0 to 1)',
  '- edit_schedule: {"libraryId", "enabled"?, "time"?}   - edit_cap: {"libraryId", "cap"} (a whole number above 0: model calls per run at most)',
  '- run_round: {"libraryId"} (one run of the library now)',
  'A source: {"name": lower-case letters, digits and "-" (1 to 40), "kind": "rss" | "arxiv" | "hn", "url" (rss), "query" (arxiv, hn), "topic"? (one of the library\'s topic names)}.',
  '"why": one or two sentences for the user. Streams checks every proposal and works out the before and after itself.',
  'Streams tries each new source once when the proposal is made (测试抓取, a test fetch) and the result is shown on the proposal; nothing is tried again when the user confirms, so say that the source was tried when the proposal was made and that the result is on the proposal, never that it will be tried on 「确认」.',
].join('\n');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const charsOf = (s) => [...s].length;

/**
 * The note a suggestion card becomes when the user taps 「要」 on it — v2 package C; redesign R5a: the desktop hands over core
 * handoffText (suggest/act.mjs: interface words, no kind name, no JSON, no raw error) instead; this one says the same in the
 * same words, for a caller of before R5a. `lang` 'en' → English, else Chinese.
 */
export function acceptedSuggestionNote({ libraryName, kind, subject, evidence, otherName }, lang = 'zh') {
  return handoffText({ kind, subject, evidence: evidence ?? {} }, { libraryName, otherName, action: kind === 'dismiss-reason' ? 'draft-proposal' : 'forward', lang });
}

/** The keys of the first top-level JSON object in `text`, in order, repeats kept (JSON.parse keeps only the last of two). */
export function topLevelKeys(text) {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  if (start < 0) return [];
  const keys = [];
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      let str = '';
      while (j < s.length && s[j] !== '"') { if (s[j] === '\\') { str += s.slice(j, j + 2); j += 2; continue; } str += s[j++]; }
      if (depth === 1) {
        let k = j + 1;
        while (k < s.length && /\s/.test(s[k])) k++;
        if (s[k] === ':') { try { keys.push(JSON.parse(`"${str}"`)); } catch { keys.push(str); } }
      }
      i = j;
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) break; }
  }
  return keys;
}

/** The `reply` of a broken answer, if one can be read out of it; else null. */
export function replyTextOf(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const parsed = extractJson(text);
  if (parsed.ok && isObject(parsed.json) && nonEmpty(parsed.json.reply)) return parsed.json.reply;
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (m) { try { const r = JSON.parse(`"${m[1]}"`); return nonEmpty(r) ? r : null; } catch { return null; } }
  return null;
}

export function checkAnswer(result, { lookupsAllowed = true } = {}) {
  const text = typeof result?.text === 'string' ? result.text : null;
  const fail = (errors) => ({ ok: false, errors, replyText: replyTextOf(text ?? '') });
  if (!result || (!result.ok && result.code !== 'bad-format')) return fail([`no answer (${result?.code ?? 'unknown'})`]);
  if (!result.ok || !isObject(result.json)) return fail(['the answer is not one JSON object']);
  const j = result.json;
  const errors = [];
  const keys = text ? topLevelKeys(text) : Object.keys(j);
  const extra = Object.keys(j).filter((k) => !ANSWER_KEYS.includes(k));
  if (extra.length) errors.push(`keys not allowed: ${extra.join(', ')} (only ${ANSWER_KEYS.join(', ')})`);
  if (keys.filter((k) => k === 'ask').length > 1) errors.push('"ask" appears twice: at most one question per answer');
  const hasLookups = j.lookups !== undefined && j.lookups !== null;
  // reply
  if (j.reply !== undefined && typeof j.reply !== 'string') errors.push('"reply" must be a string');
  else if (!hasLookups && !nonEmpty(j.reply)) errors.push('"reply" is missing or empty');
  else if (typeof j.reply === 'string' && charsOf(j.reply) > REPLY_MAX) errors.push(`"reply" is longer than ${REPLY_MAX} characters`);
  // ask
  let ask = null;
  if (j.ask !== undefined && j.ask !== null) {
    if (Array.isArray(j.ask)) errors.push('"ask" must be one object, not a list: at most one question per answer');
    else if (!isObject(j.ask)) errors.push('"ask" must be an object {question, options}');
    else {
      const { question, options } = j.ask;
      const more = Object.keys(j.ask).filter((k) => k !== 'question' && k !== 'options');
      if (more.length) errors.push(`"ask" has keys not allowed: ${more.join(', ')}`);
      if (!nonEmpty(question) || charsOf(question) > QUESTION_MAX) errors.push(`"ask.question" must be a string of 1 to ${QUESTION_MAX} characters`);
      if (!Array.isArray(options) || options.length < ASK_OPTIONS.min || options.length > ASK_OPTIONS.max || !options.every((o) => nonEmpty(o) && charsOf(o) <= OPTION_MAX)) {
        errors.push(`"ask.options" must be ${ASK_OPTIONS.min} to ${ASK_OPTIONS.max} strings of 1 to ${OPTION_MAX} characters`);
      } else if (new Set(options.map((o) => o.trim())).size !== options.length) errors.push('"ask.options" repeat an answer');
      if (nonEmpty(question) && Array.isArray(options)) ask = { question: question.trim(), options: options.map((o) => String(o).trim()) };
    }
  }
  // proposals
  let proposals = [];
  if (j.proposals !== undefined && j.proposals !== null) {
    if (!Array.isArray(j.proposals)) errors.push('"proposals" must be a list');
    else if (j.proposals.length > PROPOSALS_PER_ANSWER) errors.push(`at most ${PROPOSALS_PER_ANSWER} proposals per answer`);
    else proposals = j.proposals;
  }
  // lookups
  let lookups = [];
  if (hasLookups) {
    if (!lookupsAllowed) errors.push(`no more lookups: you looked things up ${MAX_LOOKUP_ROUNDS} times already; answer with what you have`);
    else if (!Array.isArray(j.lookups) || j.lookups.length === 0) errors.push('"lookups" must be a non-empty list');
    else if (j.lookups.length > LOOKUPS_PER_ANSWER) errors.push(`at most ${LOOKUPS_PER_ANSWER} lookups per answer`);
    else if (!j.lookups.every(isObject)) errors.push('each lookup must be an object');
    else lookups = j.lookups;
  }
  // note
  let note = null;
  if (j.note !== undefined && j.note !== null) {
    if (typeof j.note !== 'string') errors.push('"note" must be a string');
    else if (j.note.trim() !== '') note = j.note.trim();
  }
  if (errors.length) return fail(errors);
  return { ok: true, answer: { reply: typeof j.reply === 'string' ? j.reply.trim() : '', ask, proposals, lookups, note } };
}
