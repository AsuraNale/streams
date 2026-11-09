// scriptedAgentConnector({ answers, sessionful, kind, summary }) — a stand-in for the main agent's connection (tests, and
// the desktop's STREAMS_DEV_CONNECTION=fake with STREAMS_DEV_AGENT_SCRIPT). No process, no network.
//   answers    a list, one per send() in order (or a function (req, n, { sessionId }) -> one), each one of:
//                an object                the model's JSON answer (ok)
//                { $text: '...' }        the model answered this text (JSON in it is read as a connector reads it:
//                                         not JSON → bad-format)
//                { $fail: '<code>' }     the connection failed with that code (login-expired, network, …)
//                { $lost: true }         a resume that fails (sessionLost) — only when the call resumes a session
//              Past the end of the list: { reply: OUT_OF_SCRIPT }.
//   sessionful true (default): like Claude Code / Codex, send() returns a sessionId (a new one when none is given);
//              false: like an API connection
//   summary    what complete() (the compression's one-shot call) answers: a string (→ { summary }) or an object; default
//              a fixed summary
// `calls` records every call: { mode: 'send' | 'complete', prompt, system, sessionId }.
import { extractJson } from '../connect/json-output.mjs';
import { StreamsError } from '../errors.mjs';

export const OUT_OF_SCRIPT = '(the script has no more answers)';

export function scriptedAgentConnector({ answers = [], sessionful = true, kind = 'fake', summary = 'scripted summary of the conversation', model = 'fake-model' } = {}) {
  const calls = [];
  let sends = 0;
  let sessions = 0;
  const ok = (json) => ({ ok: true, json: structuredClone(json), text: JSON.stringify(json), usage: { calls: 1, inputTokens: 10, outputTokens: 5 }, model });

  async function send(req, { sessionId } = {}) {
    if (!req || typeof req.prompt !== 'string' || req.prompt === '') throw new StreamsError('bad-request', 'request is missing "prompt"');
    calls.push({ mode: 'send', prompt: req.prompt, system: req.system, sessionId: sessionId ?? null });
    const n = sends++;
    const item = typeof answers === 'function' ? answers(req, n, { sessionId }) : answers[n];
    const resumed = Boolean(sessionId);
    const sid = sessionful ? (sessionId ?? `fake-session-${++sessions}`) : null;
    if (item === undefined) return { ...ok({ reply: OUT_OF_SCRIPT }), sessionId: sid, resumed };
    if (item && item.$lost) {
      if (resumed) return { ok: false, code: 'unknown', detail: 'fake: no conversation found with that session id', usage: { calls: 1 }, model, sessionId, resumed, sessionLost: true };
      return { ...ok({ reply: OUT_OF_SCRIPT }), sessionId: sid, resumed };
    }
    if (item && typeof item.$fail === 'string') return { ok: false, code: item.$fail, detail: `fake: ${item.$fail}`, usage: { calls: 1 }, model, sessionId: sid, resumed };
    if (item && typeof item.$text === 'string') {
      const p = extractJson(item.$text);
      return p.ok
        ? { ok: true, json: p.json, text: item.$text, usage: { calls: 1 }, model, sessionId: sid, resumed }
        : { ok: false, code: 'bad-format', detail: `output is not JSON (${p.reason})`, text: item.$text, usage: { calls: 1 }, model, sessionId: sid, resumed };
    }
    return { ...ok(item), sessionId: sid, resumed };
  }

  async function complete(req) {
    calls.push({ mode: 'complete', prompt: req?.prompt, system: req?.system, sessionId: null });
    return ok(typeof summary === 'string' ? { summary } : summary);
  }

  return {
    kind, sessionful, calls, send, complete, cwd: null,
    detect: async () => ({ installed: true, loggedIn: true, version: 'fake' }),
    probe: async () => ({ ok: true, latencyMs: 0, model }),
    sends: () => calls.filter((c) => c.mode === 'send'),
  };
}
