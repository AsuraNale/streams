// Checklists of the verification layer (product spec 4.11, core-api 4.3).
//
// A checklist item: { id, desc, kind: 'rule' | 'judge', rule?, origin: 'streams' | 'user' }
//   rule  -> checked by code (rules.mjs), zero model calls
//   judge -> checked by one independent model call (judge.mjs)
//
// lockChecklist(items, { baseline, maxItems }) -> { items, notes }
//   Freezes the user's items the way Jev locks an agent's plan: malformed items are dropped
//   (never rewritten), the list is capped, and the baseline items are appended last. A user
//   item cannot take a baseline id. Every kept user item is stamped origin:'user'.
//
// gateBaseline(node)  -> baseline items for a gate node, generated from node.output
// summaryBaseline()   -> baseline items for the summary node
// describeChecklist(items, language) -> the same items, the built-in ones described in an interface language
//   ('zh-CN' | 'en'; redesign R6b-3). For showing only; baselineDescription(item, language) is the one-item form.
// Baseline items are never stored in streams.json: they are regenerated from code every time.
import { StreamsError } from '../errors.mjs';

export const MAX_CHECKLIST_ITEMS = 12;
export const MIN_DESC_CHARS = 6;
export const CHECK_KINDS = ['rule', 'judge'];

// The same word list as wording/'s hard list, kept here so the core has no dependency on it (V7).
export const BANNED_WORDS = ['Bronze', 'Silver', 'Gold', 'Medallion', 'judge', 'keeper', 'gate', 'pending', 'ledger'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function charLength(s) {
  return [...s].length;
}

function copyItem(item, origin) {
  const out = { id: item.id, desc: item.desc, kind: item.kind, origin };
  if (item.kind === 'rule') out.rule = item.rule;
  return out;
}

export function lockChecklist(items, { baseline = [], maxItems = MAX_CHECKLIST_ITEMS } = {}) {
  const notes = [];
  const kept = [];
  const seen = new Set();
  const reserved = new Set(baseline.map((b) => b.id));
  const list = Array.isArray(items) ? items : [];

  list.forEach((raw, i) => {
    const at = `item #${i + 1}`;
    if (!isPlainObject(raw)) { notes.push(`dropped ${at}: not an object`); return; }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (id === '') { notes.push(`dropped ${at}: missing id`); return; }
    if (reserved.has(id)) { notes.push(`dropped ${at}: id "${id}" is reserved for a baseline item`); return; }
    if (seen.has(id)) { notes.push(`dropped ${at}: duplicate id "${id}"`); return; }
    const desc = typeof raw.desc === 'string' ? raw.desc.trim() : '';
    if (charLength(desc) < MIN_DESC_CHARS) { notes.push(`dropped item "${id}": desc shorter than ${MIN_DESC_CHARS} chars`); return; }
    const kind = raw.kind === undefined ? 'judge' : raw.kind;
    if (!CHECK_KINDS.includes(kind)) { notes.push(`dropped item "${id}": unknown kind "${raw.kind}"`); return; }
    if (kind === 'rule' && (typeof raw.rule !== 'string' || raw.rule.trim() === '')) {
      notes.push(`dropped item "${id}": kind rule without a rule`);
      return;
    }
    seen.add(id);
    kept.push(copyItem({ id, desc, kind, rule: kind === 'rule' ? raw.rule.trim() : undefined }, 'user'));
  });

  const cap = Number.isInteger(maxItems) && maxItems >= 0 ? maxItems : MAX_CHECKLIST_ITEMS;
  if (kept.length > cap) {
    notes.push(`checklist truncated from ${kept.length} to ${cap} items`);
    kept.length = cap;
  }

  for (const b of baseline) kept.push(copyItem(b, 'streams'));
  return { items: kept, notes };
}

function rule(id, desc, r) {
  return { id, desc, kind: 'rule', rule: r, origin: 'streams' };
}

// The words of the built-in items, in the two interface languages (redesign R6b-3). The Chinese ones are what the
// pipeline runs with and what the verifier is told (they are the desc of the items below, as they always were); the
// English ones are only for showing: describeChecklist(items, 'en') swaps them in for an English interface.
// {keys} / {key} / {allowed} are filled from the item's own rule.
const BASELINE_WORDS = {
  'zh-CN': {
    'json-keys': '输出包含全部约定字段：{keys}',
    range: '{key} 是 0 到 1 之间的数',
    enum: '{key} 只能是 {allowed} 之一',
    'reason-length': '理由不超过 120 字',
    'quote-in-source': '引用原话逐字出现在材料里',
    'what-nonempty': '有「这是什么」一句',
    'points-count': '要点恰好三行',
    'no-placeholder': '没有 TODO / TBD / FIXME 占位',
    'no-banned-words': '没有内部用词',
    'numbers-in-source': '摘要里的每个数字和断言都能在材料里找到，目标 / 预计 / 已完成这类状态词没被升级',
  },
  en: {
    'json-keys': 'The output has every agreed field: {keys}',
    range: '{key} is a number from 0 to 1',
    enum: '{key} is one of {allowed}',
    'reason-length': 'The reason is at most 120 characters',
    'quote-in-source': 'The quoted words appear word for word in the material',
    'what-nonempty': 'There is a one-line overview',
    'points-count': 'There are exactly three points',
    'no-placeholder': 'No TODO / TBD / FIXME left in',
    'no-banned-words': 'No internal terms',
    'numbers-in-source': 'Every number and claim in the summary can be found in the material, and words such as target / expected / done are not upgraded',
  },
};
const KEYS_JOIN = { 'zh-CN': '、', en: ', ' };
export const BASELINE_LANGUAGES = Object.keys(BASELINE_WORDS);

function languageOf(language) {
  return Object.hasOwn(BASELINE_WORDS, language) ? language : 'zh-CN';
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(values, k) ? values[k] : m));
}

export function gateBaseline(node, language = 'zh-CN') {
  const output = node?.output;
  if (!isPlainObject(output) || Object.keys(output).length === 0) {
    throw new StreamsError('bad-node', 'gateBaseline needs a node with a non-empty "output"');
  }
  const lang = languageOf(language);
  const w = BASELINE_WORDS[lang];
  const keys = Object.keys(output);
  const items = [rule('json-keys', fill(w['json-keys'], { keys: keys.join(KEYS_JOIN[lang]) }), `json_keys:${keys.join(',')}`)];
  for (const key of keys) {
    const type = String(output[key]);
    if (type === 'score') {
      items.push(rule(`range-${key}`, fill(w.range, { key }), `json_range:${key},0,1`));
    } else if (type.startsWith('enum:')) {
      const allowed = type.slice('enum:'.length);
      items.push(rule(`enum-${key}`, fill(w.enum, { key, allowed: allowed.split('|').join(' / ') }), `json_enum:${key},${allowed}`));
    }
  }
  items.push(rule('reason-length', w['reason-length'], 'max_chars:reason,120'));
  items.push(rule('quote-in-source', w['quote-in-source'], 'quote_in_source:quote'));
  return items;
}

export function summaryBaseline(language = 'zh-CN') {
  const w = BASELINE_WORDS[languageOf(language)];
  return [
    rule('what-nonempty', w['what-nonempty'], 'json_nonempty:what'),
    rule('points-count', w['points-count'], 'json_count:points,3'),
    rule('no-placeholder', w['no-placeholder'], 'not_regex:\\b(TODO|TBD|FIXME)\\b'),
    rule('no-banned-words', w['no-banned-words'], `not_regex:\\b(${BANNED_WORDS.join('|')})\\b`),
    rule('quote-in-source', w['quote-in-source'], 'quote_in_source:quote'),
    {
      id: 'numbers-in-source',
      desc: w['numbers-in-source'],
      kind: 'judge',
      origin: 'streams',
    },
  ];
}

// The description of one built-in item in a language, worked out from its id and its rule (never from its desc), or
// null when the item is not one of the built-in ones (a user's item, an id this version does not know).
export function baselineDescription(item, language = 'zh-CN') {
  if (!isPlainObject(item) || item.origin !== 'streams' || typeof item.id !== 'string') return null;
  const lang = languageOf(language);
  const w = BASELINE_WORDS[lang];
  const ruleText = typeof item.rule === 'string' ? item.rule : '';
  const args = ruleText.includes(':') ? ruleText.slice(ruleText.indexOf(':') + 1) : '';
  if (item.id === 'json-keys') {
    if (!ruleText.startsWith('json_keys:') || args === '') return null;
    return fill(w['json-keys'], { keys: args.split(',').join(KEYS_JOIN[lang]) });
  }
  if (item.id.startsWith('range-')) return fill(w.range, { key: item.id.slice('range-'.length) });
  if (item.id.startsWith('enum-')) {
    if (!ruleText.startsWith('json_enum:') || !args.includes(',')) return null;
    return fill(w.enum, { key: item.id.slice('enum-'.length), allowed: args.slice(args.indexOf(',') + 1).split('|').join(' / ') });
  }
  if (item.id === 'range' || item.id === 'enum') return null;
  return Object.hasOwn(w, item.id) ? w[item.id] : null;
}

// A checklist for showing in an interface language: the built-in items carry that language's description; everything
// else (the user's own items, the ids, the rules, the order) is as it was. The input is not changed. For the screen
// only: what runs and what is stored keeps the items gateBaseline / summaryBaseline give.
export function describeChecklist(items, language = 'zh-CN') {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const desc = baselineDescription(it, language);
    return desc === null ? it : { ...it, desc };
  });
}
