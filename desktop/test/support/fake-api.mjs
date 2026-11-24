// A stand-in for a model vendor's API on 127.0.0.1 (1.1.1 P6, acceptance B17): the OpenAI-compatible /chat/completions that
// the API connection (custom vendor, its address here) calls. Each request goes to `respond(body, i)`, which returns the answer
// as the vendor would: a message (text or tool_calls). Every request is kept, with its headers.
//   const api = await startFakeApi(respond)   -> { baseUrl: 'http://127.0.0.1:<port>/v1', requests, close() }
// Helpers for the answers:
//   text(t)                        a plain answer
//   tools([[name, input], …])      the model asks for tools
import { createServer } from 'node:http'

export const text = t => ({ choices: [{ message: { role: 'assistant', content: t }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
export const tools = calls => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: calls.map(([name, input], i) => ({ id: `call_${i}_${name}`, type: 'function', function: { name, arguments: JSON.stringify(input) } })) }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } })

export async function startFakeApi(respond) {
  const requests = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', d => { raw += d })
    req.on('end', () => {
      let body = null
      try { body = JSON.parse(raw) } catch { body = null }
      requests.push({ url: req.url, headers: req.headers, body })
      if (req.url !== '/v1/chat/completions' || !body) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":{"message":"not here"}}'); return }
      let answer
      try { answer = respond(body, requests.length - 1) } catch (err) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: String(err?.message ?? err) } })); return }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(answer))
    })
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, requests, close: () => new Promise(r => server.close(r)) }
}
