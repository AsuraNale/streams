// Read a `claude -p --output-format stream-json --verbose` stdout (11-19 prototype): what the run did, not only what it said.
// parseStream(stdout) -> {
//   result,                 the final envelope (type: 'result') or null
//   text,                   its `result` text ('' when none)
//   fetches: [{ url, prompt, text, isError }],   every WebFetch call with the text it got back
//   searches: [{ query, isError }],              every WebSearch call
//   otherTools: [name],     any other tool the run used (there should be none)
//   quota,                  the last rate_limit_event's windows: { five_hour, seven_day } utilization 0–1, or null
//   costUsd, turns, isError, models
// }
// Never throws: a line that is not JSON is skipped.
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : typeof c?.text === 'string' ? c.text : '')).join('\n');
  return '';
}

export function parseStream(stdout) {
  const rows = [];
  for (const line of String(stdout ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      // not a JSON line
    }
  }
  const uses = new Map();
  const order = [];
  const results = new Map();
  let quota = null;
  for (const r of rows) {
    if (r?.type === 'assistant') {
      for (const c of r.message?.content ?? []) if (c?.type === 'tool_use') { uses.set(c.id, c); order.push(c.id); }
    } else if (r?.type === 'user') {
      for (const c of r.message?.content ?? []) if (c?.type === 'tool_result') results.set(c.tool_use_id, { text: textOf(c.content), isError: c.is_error === true });
    } else if (r?.type === 'rate_limit_event') {
      const w = r.rate_limit_info?.unifiedWindows;
      if (w && typeof w === 'object') quota = { five_hour: w.five_hour?.utilization ?? null, seven_day: w.seven_day?.utilization ?? null };
    }
  }
  const fetches = [];
  const searches = [];
  const otherTools = [];
  for (const id of order) {
    const u = uses.get(id);
    const res = results.get(id) ?? { text: '', isError: true };
    if (u.name === 'WebFetch') fetches.push({ url: String(u.input?.url ?? ''), prompt: String(u.input?.prompt ?? ''), text: res.text, isError: res.isError });
    else if (u.name === 'WebSearch') searches.push({ query: String(u.input?.query ?? ''), isError: res.isError });
    else otherTools.push(u.name);
  }
  const result = [...rows].reverse().find((r) => r?.type === 'result') ?? null;
  return {
    result,
    text: typeof result?.result === 'string' ? result.result : '',
    fetches,
    searches,
    otherTools,
    quota,
    costUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null,
    turns: typeof result?.num_turns === 'number' ? result.num_turns : null,
    isError: result ? result.is_error === true : true,
    models: result?.modelUsage && typeof result.modelUsage === 'object' ? Object.keys(result.modelUsage) : [],
  };
}

// The JSON object the model was asked to end with: the text from the first `{` to the last `}`; null when it is not JSON.
export function answerJson(text) {
  const s = String(text ?? '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(s.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
