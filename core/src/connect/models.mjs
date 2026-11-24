// Built-in model tables and vendor presets. Replaced on each release; any id can also be typed by hand.
//
// Sources (2026-11-02):
//   claude-code  given by the product owner; Fable 5.1 recommended; omitting --model = Claude Code's own default
//   codex        read from this machine's ~/.codex/models_cache.json (Codex client 0.166.0, fetched 2026-11-02):
//                the listed (visibility: list) slugs in cache priority order
//   api vendors  base URLs from the product spec; default model ids are best-effort and marked `unverified`
//                where no local evidence exists
import { StreamsError } from '../errors.mjs';
import { CONNECTION_KINDS } from './types.mjs';

export const CLAUDE_CODE_MODELS = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1', recommended: true },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
];

export const CODEX_MODELS = [
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', recommended: true },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
  { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
];

// API presets. `style` picks the wire protocol: 'anthropic' = Messages API, 'openai' = /chat/completions.
export const VENDORS = {
  anthropic: {
    label: 'Anthropic',
    style: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-opus-5-5', label: 'Opus 5.5', recommended: true },
      { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
      { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
      { id: 'claude-fable-5-1', label: 'Fable 5.1' },
    ],
  },
  openai: {
    label: 'OpenAI',
    style: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', recommended: true, unverified: true },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', unverified: true },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    style: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    // 1.1.1 P6 (C9): tested — building (4 customers, 23 / 26) and updating (4 cards) passed the same line as Claude Code's,
    // 2026-11-24, docs/checks/2026-11-24-1.1.1/p6/; the others are not tested (设置 marks them so)
    models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat', recommended: true, tested: '2026-11-24' }],
  },
  moonshot: {
    label: 'Moonshot (Kimi)',
    style: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [{ id: 'kimi-k2-0905-preview', label: 'Kimi K2', recommended: true, unverified: true }],
  },
  zhipu: {
    label: 'Zhipu (GLM)',
    style: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [{ id: 'glm-4.6', label: 'GLM-4.6', recommended: true, unverified: true }],
  },
  gemini: {
    label: 'Google Gemini',
    style: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', recommended: true, unverified: true }],
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    style: 'openai',
    baseUrl: null, // must be typed by hand
    models: [],
  },
};

export const VENDOR_IDS = Object.keys(VENDORS);

export function modelsFor(kind, vendor) {
  switch (kind) {
    case 'claude-code': return CLAUDE_CODE_MODELS.map((m) => ({ ...m }));
    case 'codex': return CODEX_MODELS.map((m) => ({ ...m }));
    case 'api': {
      const v = VENDORS[vendor];
      if (!v) throw new StreamsError('bad-connection', `unknown vendor "${vendor}"`);
      return v.models.map((m) => ({ ...m }));
    }
    default:
      throw new StreamsError('bad-connection', `unknown connection kind "${kind}"`);
  }
}

export function recommendedModel(kind, vendor) {
  const list = modelsFor(kind, vendor);
  const rec = list.find((m) => m.recommended) ?? list[0];
  return rec ? rec.id : undefined;
}

// Default when the connection names no model.
//   claude-code / codex -> undefined (no --model / -m: the tool's own default)
//   api                 -> the vendor's recommended model (the wire request must name one)
export function defaultModelFor(kind, vendor) {
  if (kind === 'api') return recommendedModel('api', vendor);
  return undefined;
}

function nonEmpty(s) {
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : undefined;
}

// resolveModel(connection, slot) -> model id | undefined
//   slot: 'main' (default) | 'verify' | any other string = an explicit model id used as-is
//   verify falls back to main; main falls back to the kind's default.
export function resolveModel(connection, slot = 'main') {
  if (!connection || !CONNECTION_KINDS.includes(connection.kind)) {
    throw new StreamsError('bad-connection', `unknown connection kind "${connection && connection.kind}"`);
  }
  const vendor = connection.api && connection.api.vendor;
  const main = nonEmpty(connection.model) ?? defaultModelFor(connection.kind, vendor);
  if (slot === undefined || slot === 'main') return main;
  if (slot === 'verify') return nonEmpty(connection.verifyModel) ?? main;
  if (typeof slot === 'string' && slot.trim() !== '') return slot.trim();
  throw new StreamsError('bad-request', `bad model slot "${slot}"`);
}
