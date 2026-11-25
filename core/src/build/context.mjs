// What Streams adds to the main agent's prompt about the library it is talking about (1.1.2 第 4、5 件; 维护者 11-25 「主Agent
// 在建完库后我就没法继续聊了，像找它帮忙调用量也没办法」, user case U5): the library's step of 「每次更新的量」, its earlier
// conversations with the main agent (what the user said and what was asked, in short), and its last update (how much it
// read against its limits, the sources it did not get to, what the update agent left for the card). The agent cannot see
// the library itself; this is what it is told of it. A new library gets the step only (what the user chose in 设置).
//
// buildContext({ volume, conversations, lastUpdate, language }) -> the Markdown blocks ('' when there is nothing to say)
//   volume         'standard' | 'more' | 'most' (library/volume.mjs), or null
//   conversations  earlier conversations, oldest first: [{ startedAt?, endedAt?, mode?, why?, turns: [{ role: 'user', text }
//                  | { role: 'agent', kind, say?, question? }] }]
//   lastUpdate     the library's last update record (rounds.jsonl kind 'update'), or null
import { VOLUME_WORDS } from './card.mjs';
import { STANDARD_UPDATE, VOLUME_FACTOR } from '../library/volume.mjs';

export const CONTEXT_LIMITS = Object.freeze({ conversations: 3, linesPer: 24, chars: 300, gaps: 8 });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clip = (t, n = CONTEXT_LIMITS.chars) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };
const day = (iso) => (typeof iso === 'string' && iso.length >= 16 ? iso.slice(0, 16).replace('T', ' ') : '');
// an update agent's own line for a source it did not read because the limit was reached (it writes its words; these are the
// ones the 11-25 user case shows: 「这次没读（用量不够）」)
export const NOT_READ_FOR_LIMIT = /(没读|未读|没有读|not read).*(用量|上限|额度|次数|budget|limit)|(用量|上限|额度|budget|limit).*(没读|未读|not read)/i;

export function volumeBlock(volume) {
  if (!Object.hasOwn(VOLUME_FACTOR, volume ?? '')) return '';
  const w = VOLUME_WORDS['zh-CN'];
  const f = VOLUME_FACTOR[volume];
  return `## 这座库的「每次更新的量」\n现在是「${w[volume]}」：每次更新最多取 ${STANDARD_UPDATE.newLinks * f} 个新链接、搜索约 ${STANDARD_UPDATE.searches * f} 次、读网页约 ${STANDARD_UPDATE.reads * f} 次（至少比卡上的来源数多 8 次）、交 ${STANDARD_UPDATE.items * f} 条以内。三档：标准、较多（约 2 倍）、最多（约 3 倍）；量越大，一次更新越久，花的套餐额度或 API 费用也越多。改档要用户确认：在卡上写 volume。`;
}

export function conversationsBlock(conversations = []) {
  const list = (Array.isArray(conversations) ? conversations : []).filter((c) => isObj(c) && Array.isArray(c.turns)).slice(-CONTEXT_LIMITS.conversations);
  if (!list.length) return '';
  const out = ['## 之前和用户的对话（要点；你看不到原来的会话，这是流息记下的）'];
  for (const c of list) {
    const what = c.mode === 'edit' ? '改卡' : c.mode === 'convert' ? '把上一版的库换过来' : '建库';
    const end = c.why === 'built' ? '，用户点了确认' : c.why === 'dropped' ? '，用户没有确认（不建了 / 不改了）' : '';
    out.push(`### ${day(c.startedAt)} ${what}${end}`);
    const lines = [];
    for (const t of c.turns) {
      if (t?.role === 'user' && t.text) lines.push(`- 用户：${clip(t.text)}`);
      else if (t?.role === 'agent' && t.kind === 'question' && t.question?.text) lines.push(`- 你问：${clip(t.question.text)}`);
      else if (t?.role === 'agent' && t.kind === 'card') lines.push('- 你交了一张建库卡');
      else if (t?.role === 'agent' && t.say) lines.push(`- 你说：${clip(t.say, 160)}`);
    }
    out.push(...(lines.length > CONTEXT_LIMITS.linesPer ? [...lines.slice(0, 4), '- ……', ...lines.slice(-(CONTEXT_LIMITS.linesPer - 5))] : lines));
  }
  return out.join('\n');
}

export function lastUpdateBlock(record) {
  if (!isObj(record) || record.kind !== 'update') return '';
  const c = isObj(record.counts) ? record.counts : {};
  const b = isObj(record.budget) ? record.budget : null;
  const a = isObj(record.agent) ? record.agent : {};
  const out = [`## 这座库最近一次更新（${day(record.startedAt)}，${record.status === 'done' ? '跑完了' : `结果：${record.status}`}）`];
  out.push(`- 读了 ${c.read ?? 0} 个来源（${c.unreadable ?? 0} 个读不到），取回 ${c.originals ?? 0} 篇新原文，交了 ${c.items ?? 0} 条，进待看 ${c.inbox ?? 0} 条。`);
  if (Number.isInteger(a.reads) || Number.isInteger(a.searches)) {
    out.push(`- 更新 Agent 读网页 ${a.reads ?? 0}${b?.reads ? ` / 上限 ${b.reads}` : ''} 次，搜索 ${a.searches ?? 0}${b?.searches ? ` / 上限 ${b.searches}` : ''} 次。`);
  }
  const notRead = (Array.isArray(a.sources) ? a.sources : []).filter((x) => isObj(x) && NOT_READ_FOR_LIMIT.test(String(x.status ?? '')));
  if (notRead.length) out.push(`- 因为用量不够没读的来源 ${notRead.length} 个：${notRead.map((x) => x.url).join('、')}`);
  if (Array.isArray(record.unfinished) && record.unfinished.length) out.push(`- 流息这次没读到的来源 ${record.unfinished.length} 个（下次先读）。`);
  const gaps = (Array.isArray(a.gaps) ? a.gaps : []).map((g) => (typeof g === 'string' ? g : g?.text)).filter((g) => typeof g === 'string' && g.trim());
  if (gaps.length) out.push('- 更新 Agent 留下的改卡建议：', ...gaps.slice(0, CONTEXT_LIMITS.gaps).map((g) => `  - ${clip(g)}`));
  return out.join('\n');
}

export function buildContext({ volume = null, conversations = [], lastUpdate = null } = {}) {
  return [volumeBlock(volume), conversationsBlock(conversations), lastUpdateBlock(lastUpdate)].filter(Boolean).join('\n\n');
}

/** How much of a library's last update was left for the limit (the page's 「接近上限」): null when it was not near it. */
export function nearLimit(record) {
  if (!isObj(record) || record.kind !== 'update' || !isObj(record.budget)) return null;
  const a = isObj(record.agent) ? record.agent : {};
  const reads = Number.isInteger(a.reads) ? a.reads : 0;
  const limit = Number.isInteger(record.budget.reads) ? record.budget.reads : 0;
  const notRead = (Array.isArray(a.sources) ? a.sources : []).filter((x) => isObj(x) && NOT_READ_FOR_LIMIT.test(String(x.status ?? ''))).length;
  const unfinished = Array.isArray(record.unfinished) ? record.unfinished.length : 0;
  const near = limit > 0 && reads >= Math.max(1, Math.floor(limit * 0.9));
  if (!near && notRead === 0 && unfinished === 0) return null;
  return { reads, limit, notRead: notRead + unfinished, volume: record.volume ?? null };
}
