// What the app checks before it does anything (1.1 W1, C2 / C3): the definition file loads and is sound, and both SOPs
// are there and not empty. The desktop calls this at start-up and shows what is wrong instead of running on a missing
// SOP or a broken definition.
// startupCheck({ definitionPath, sopDir }) -> { ok, problems: [{ code, message }] }
import { loadDefinition, DEFINITION_PATH } from './definition.mjs';
import { checkSops, SOP_DIR } from '../sop/sop.mjs';

export function startupCheck({ definitionPath = DEFINITION_PATH, sopDir = SOP_DIR } = {}) {
  const problems = [];
  try {
    loadDefinition({ path: definitionPath });
  } catch (e) {
    problems.push({ code: e.code ?? 'ontology-invalid', message: e.message });
  }
  problems.push(...checkSops({ dir: sopDir }).problems);
  return { ok: problems.length === 0, problems };
}
