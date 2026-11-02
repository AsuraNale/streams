// completeJson(connector, req, { retries = 1, onRetry }) -> same shape as complete(), plus `attempts`
//
// The connector half of V5: a bad-format answer gets one more try with a fixed reminder appended to
// the prompt; a second bad answer comes back as { ok:false, code:'bad-format', attempts:2 } and the
// pipeline marks the item unscored. Any other failure (login, network, ...) is returned at once.
// usage.calls is the sum over attempts.
export const RETRY_SUFFIX = '\n\nYour previous output did not match the required format. Output only the JSON, nothing else.';

export async function completeJson(connector, req, { retries = 1, onRetry } = {}) {
  let attempts = 0;
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let sawTokens = false;
  let sawCost = false;
  let prompt = req.prompt;
  let last;
  while (attempts <= retries) {
    attempts++;
    last = await connector.complete({ ...req, prompt, format: 'json' });
    const u = last.usage || {};
    calls += typeof u.calls === 'number' ? u.calls : 1;
    if (typeof u.inputTokens === 'number') { inputTokens += u.inputTokens; sawTokens = true; }
    if (typeof u.outputTokens === 'number') { outputTokens += u.outputTokens; sawTokens = true; }
    if (typeof u.costUsd === 'number') { costUsd += u.costUsd; sawCost = true; }
    if (last.ok || last.code !== 'bad-format' || attempts > retries) break;
    if (typeof onRetry === 'function') onRetry({ attempt: attempts, text: last.text, detail: last.detail });
    prompt = req.prompt + RETRY_SUFFIX;
  }
  const usage = { calls };
  if (sawTokens) { usage.inputTokens = inputTokens; usage.outputTokens = outputTokens; }
  if (sawCost) usage.costUsd = costUsd;
  return { ...last, usage, attempts };
}
