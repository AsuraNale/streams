// A local HTTP stand-in for the Anthropic Messages API and an OpenAI-compatible /chat/completions.
// startFakeApi() -> { baseUrl, requests, close() }
//   The key that works: GOOD_KEY. Anything else -> 401 whose body quotes the key (as real vendors do).
//   The model picks the behaviour: 'nope' 404 · 'busy' 429 · 'boom' 500 · 'slow' waits 400 ms ·
//   'bad' answers prose · 'fence' answers a ```json fence · 'refuse' declines · 'echo-key' 400 quoting the key ·
//   'max' stops at max_tokens with half a JSON · anything else answers {"ok":true,"echo":<prompt>}.
import { createServer } from 'node:http';

export const GOOD_KEY = 'sk-test-good-key-1234567890';

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

export async function startFakeApi() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    let body = null;
    try { body = JSON.parse(raw); } catch { body = null; }
    const anthropic = req.url.endsWith('/v1/messages');
    const key = anthropic ? req.headers['x-api-key'] : (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    requests.push({ url: req.url, headers: req.headers, body, raw });
    if (req.method !== 'POST' || !(anthropic || req.url.endsWith('/chat/completions'))) return send(res, 404, { error: { message: 'no such route' } });
    if (key !== GOOD_KEY) {
      return anthropic
        ? send(res, 401, { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${key}` } })
        : send(res, 401, { error: { message: `Incorrect API key provided: ${key}`, type: 'invalid_request_error', code: 'invalid_api_key' } });
    }
    const model = body && body.model;
    const prompt = anthropic ? body.messages[0].content : body.messages[body.messages.length - 1].content;
    const ok = (text, extra = {}) => anthropic
      ? send(res, 200, { id: 'msg_1', type: 'message', role: 'assistant', model, content: [{ type: 'text', text }], stop_reason: extra.stop || 'end_turn', usage: { input_tokens: 11, cache_creation_input_tokens: 1, cache_read_input_tokens: 2, output_tokens: 6 } })
      : send(res, 200, { id: 'chatcmpl_1', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: extra.finish || 'stop' }], usage: { prompt_tokens: 14, completion_tokens: 6, total_tokens: 20 } });
    switch (model) {
      case 'nope':
        return anthropic
          ? send(res, 404, { type: 'error', error: { type: 'not_found_error', message: `model: ${model}` } })
          : send(res, 404, { error: { message: `The model \`${model}\` does not exist`, type: 'invalid_request_error', code: 'model_not_found' } });
      case 'busy':
        return send(res, 429, anthropic ? { type: 'error', error: { type: 'rate_limit_error', message: 'rate limit' } } : { error: { message: 'Rate limit reached', type: 'tokens', code: 'rate_limit_exceeded' } });
      case 'boom':
        return send(res, 500, { error: { message: 'internal' } });
      case 'slow':
        await new Promise((r) => setTimeout(r, 400));
        return ok('{"ok":true}');
      case 'bad':
        return ok('Sure! The score is probably around 0.8 but I cannot give JSON.');
      case 'fence':
        return ok('Here you go:\n```json\n{"ok":true,"fenced":true}\n```\nDone.');
      case 'refuse':
        return ok('', { stop: 'refusal', finish: 'content_filter' });
      case 'max':
        return ok('{"ok":true,"long":"aaaaaaaa', { stop: 'max_tokens', finish: 'length' });
      case 'echo-key':
        return send(res, 400, anthropic ? { type: 'error', error: { type: 'invalid_request_error', message: `bad request for key ${key}` } } : { error: { message: `bad request for key ${key}` } });
      case 'echo-key-ok':
        return ok(JSON.stringify({ ok: true, note: `your key is ${key}` }));
      case 'refuse-key':
        return ok(`I will not, ${key}`, { stop: 'refusal', finish: 'content_filter' });
      case 'html-key':
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end(`<html><body>gateway page for ${key}</body></html>`);
      case 'boom-key':
        res.writeHead(502, { 'content-type': 'text/plain' });
        return res.end('x'.repeat(290) + key + ' bad gateway');
      case 'nope-bare':
        return send(res, 404, {});
      case 'busy-bare':
        res.writeHead(429, { 'content-type': 'text/plain' });
        return res.end('');
      default:
        return ok(JSON.stringify({ ok: true, echo: prompt }));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  };
}
