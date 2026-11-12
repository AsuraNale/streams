// The last run of a library told as one funnel (redesign R2, N10 · F18): what an empty 待看 and the right panel's 进度 show.
// Every number comes from one rounds.jsonl record (rounds-log.mjs); nothing is estimated and nothing is made up.
//
// runFunnel(record) -> {
//   id, startedAt, finishedAt, complete, scoreless, sources,
//   cells: [{ id: 'fetched' | 'new' | 'gate:<id>' | 'inbox', n: number | null, stop?: true, skipped?: true }],
//   stop:  { cell, why: 'cap' | 'aborted' | 'connection' | 'self-check', node, code?, connectionCode? } | null,
//   calls: { total, parts: [{ id: 'self-check' | 'gate:<id>' | 'summary' | 'verify', n }] | null },
// }
//   cells, in order: 已抓取 (counts.fetched; `sources` = how many sources the run asked) → 去重后新增 (counts.new) → one cell per
//   gate in the pipeline's order, the items that passed it (gates[id].passed) → 进入待看 (counts.inbox).
//   A run that stopped (stoppedAt) stops at the cell of the step it stopped at (stoppedNode: a gate → its cell; the summary →
//   进入待看); that cell is n:null with stop:true, every cell after it n:null. A record without stoppedNode (older) stops at
//   进入待看. A run without a connection (scoreless) has its gate cells n:null, skipped:true.
//   calls.total = callsBy.selfCheck + calls (the parts add up to it); a record without callsBy (older runs) has only the total,
//   = calls, and parts:null — no part is made up.
// failedStart({ at, problems }) -> the same shape for a run that did not start (its self-check failed; the desktop keeps
//   when and why, the core writes nothing then): id null, every cell n:null, the first cell stop:true, stop.why 'self-check'
//   with the problem's code and connectionCode, calls null.
// callsAddUp(funnel) -> boolean   the parts add up to the total (true when there are no parts)

function gateIdsOf(record) {
  const gates = record?.gates && typeof record.gates === 'object' ? record.gates : {};
  return Object.keys(gates);
}

const num = (v) => (Number.isFinite(v) ? v : 0);

export function runFunnel(record) {
  if (!record || typeof record !== 'object') return null;
  const counts = record.counts ?? {};
  const gateIds = gateIdsOf(record);
  const cells = [
    { id: 'fetched', n: num(counts.fetched) },
    { id: 'new', n: num(counts.new) },
    ...gateIds.map((id) => ({ id: `gate:${id}`, n: num(record.gates[id]?.passed) })),
    { id: 'inbox', n: num(counts.inbox) },
  ];
  const scoreless = record.scoreless === true;
  if (scoreless) for (const c of cells) if (c.id.startsWith('gate:')) { c.n = null; c.skipped = true; }
  let stop = null;
  if (typeof record.stoppedAt === 'string' && record.stoppedAt !== '') {
    const node = typeof record.stoppedNode === 'string' ? record.stoppedNode : null;
    let at = node && gateIds.includes(node) ? cells.findIndex((c) => c.id === `gate:${node}`) : cells.length - 1;
    if (at < 0) at = cells.length - 1;
    for (let i = at; i < cells.length; i++) cells[i].n = null;
    cells[at].stop = true;
    const p = (record.problems ?? []).find((x) => x && x.code === 'connection');
    stop = { cell: at, why: record.stoppedAt, node, ...(record.stoppedAt === 'connection' && p ? { code: 'connection', connectionCode: p.connectionCode ?? null } : {}) };
  }
  const by = record.callsBy && typeof record.callsBy === 'object' ? record.callsBy : null;
  let calls;
  if (by) {
    const parts = [
      { id: 'self-check', n: num(by.selfCheck) },
      ...gateIds.map((id) => ({ id: `gate:${id}`, n: num(by.gates?.[id]) })),
      { id: 'summary', n: num(by.summary) },
      { id: 'verify', n: num(by.verify) },
    ];
    calls = { total: num(by.selfCheck) + num(record.calls), parts };
  } else {
    calls = { total: num(record.calls), parts: null };
  }
  return {
    id: record.id ?? null,
    startedAt: record.startedAt ?? null,
    finishedAt: record.finishedAt ?? null,
    complete: stop === null,
    scoreless,
    sources: Array.isArray(record.fetch) ? record.fetch.length : 0,
    cells,
    stop,
    calls,
  };
}

export function failedStart({ at, problems, gates = ['relevance', 'substance'] } = {}) {
  const p = Array.isArray(problems) && problems.length ? problems[0] : null;
  const cells = [
    { id: 'fetched', n: null, stop: true },
    { id: 'new', n: null },
    ...gates.map((id) => ({ id: `gate:${id}`, n: null })),
    { id: 'inbox', n: null },
  ];
  return {
    id: null, startedAt: at ?? null, finishedAt: null, complete: false, scoreless: false, sources: 0, cells,
    stop: { cell: 0, why: 'self-check', node: null, code: p?.code ?? null, connectionCode: p?.connectionCode ?? null },
    calls: null,
  };
}

export function callsAddUp(funnel) {
  if (!funnel?.calls || !Array.isArray(funnel.calls.parts)) return true;
  return funnel.calls.parts.reduce((a, p) => a + p.n, 0) === funnel.calls.total;
}
