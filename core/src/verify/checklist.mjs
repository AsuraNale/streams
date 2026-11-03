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

export function gateBaseline(node) {
  const output = node?.output;
  if (!isPlainObject(output) || Object.keys(output).length === 0) {
    throw new StreamsError('bad-node', 'gateBaseline needs a node with a non-empty "output"');
  }
  const keys = Object.keys(output);
  const items = [rule('json-keys', `输出包含全部约定字段：${keys.join('、')}`, `json_keys:${keys.join(',')}`)];
  for (const key of keys) {
    const type = String(output[key]);
    if (type === 'score') {
      items.push(rule(`range-${key}`, `${key} 是 0 到 1 之间的数`, `json_range:${key},0,1`));
    } else if (type.startsWith('enum:')) {
      const allowed = type.slice('enum:'.length);
      items.push(rule(`enum-${key}`, `${key} 只能是 ${allowed.split('|').join(' / ')} 之一`, `json_enum:${key},${allowed}`));
    }
  }
  items.push(rule('reason-length', '理由不超过 120 字', 'max_chars:reason,120'));
  items.push(rule('quote-in-source', '引用原话逐字出现在材料里', 'quote_in_source:quote'));
  return items;
}

export function summaryBaseline() {
  return [
    rule('what-nonempty', '有「这是什么」一句', 'json_nonempty:what'),
    rule('points-count', '要点恰好三行', 'json_count:points,3'),
    rule('no-placeholder', '没有 TODO / TBD / FIXME 占位', 'not_regex:\\b(TODO|TBD|FIXME)\\b'),
    rule('no-banned-words', '没有内部用词', `not_regex:\\b(${BANNED_WORDS.join('|')})\\b`),
    rule('quote-in-source', '引用原话逐字出现在材料里', 'quote_in_source:quote'),
    {
      id: 'numbers-in-source',
      desc: '摘要里的每个数字和断言都能在材料里找到，目标 / 预计 / 已完成这类状态词没被升级',
      kind: 'judge',
      origin: 'streams',
    },
  ];
}
