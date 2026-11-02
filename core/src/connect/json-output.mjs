// extractJson(text) -> { ok: true, json } | { ok: false, reason }
//
// Tolerates: a ```json / ``` fence, prose before or after the JSON, whitespace.
// Never repairs: a trailing comma, a single quote, an unclosed brace all stay bad-format.
// Only an object or an array counts as "the JSON"; a bare number or string is not an answer.
//   reasons: 'empty' | 'no-json' | 'invalid-json' | 'not-object'

const FENCE = /```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n?```/;

function parseStrict(s) {
  const v = JSON.parse(s);
  if (v === null || typeof v !== 'object') return { ok: false, reason: 'not-object' };
  return { ok: true, json: v };
}

// Walk from an opening bracket to its matching close, honouring strings and escapes.
function balancedSlice(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return ch === close ? text.slice(start, i + 1) : null;
    }
  }
  return null;
}

export function extractJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'empty' };
  const trimmed = text.trim();

  // 1. the whole thing is JSON
  try {
    return parseStrict(trimmed);
  } catch { /* fall through */ }

  // 2. a fenced block
  const fence = FENCE.exec(trimmed);
  if (fence) {
    try {
      return parseStrict(fence[1].trim());
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }
  }

  // 3. first balanced {...} or [...] anywhere in the text
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== '{' && trimmed[i] !== '[') continue;
    const slice = balancedSlice(trimmed, i);
    if (slice === null) return { ok: false, reason: 'invalid-json' };
    try {
      return parseStrict(slice);
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }
  }
  return { ok: false, reason: 'no-json' };
}
