// The definition of what exists in Streams and what can be done to it: core/src/ontology/streams.json (1.1 W1).
// loadDefinition({ path }) -> the definition, checked; a file that does not fit throws StreamsError('ontology-invalid')
//   with every problem and where it is (the app's start-up check, startup.mjs, turns that into an error the user sees).
// actionsFor(definition, actor) -> [{ name, object, confirm, tool, budget, about, params }]: the list an agent is given,
//   made from the file — an action added there appears here; one taken out is gone (C3).
// The rule the file stands for: an AI changes things only through these actions; anything else is refused (actions.mjs).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamsError } from '../errors.mjs';
import { checkSchemaShape } from './schema.mjs';

export const DEFINITION_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'ontology', 'streams.json');
export const DEFINITION_SCHEMA = 'streams.ontology/1';
const NAME = /^[a-z][a-z0-9_]*$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function checkDefinition(d) {
  const errors = [];
  if (!isObj(d)) return ['the definition is not a JSON object'];
  if (d.schema !== DEFINITION_SCHEMA) errors.push(`schema must be "${DEFINITION_SCHEMA}"`);
  if (!isObj(d.actors) || Object.keys(d.actors).length === 0) errors.push('actors: at least one actor');
  if (!isObj(d.objects) || Object.keys(d.objects).length === 0) errors.push('objects: at least one object');
  if (!isObj(d.actions) || Object.keys(d.actions).length === 0) errors.push('actions: at least one action');
  if (errors.length) return errors;
  for (const [name, o] of Object.entries(d.objects)) {
    if (!NAME.test(name)) errors.push(`objects.${name}: a name is lower case letters, digits and _`);
    if (!isObj(o)) { errors.push(`objects.${name}: must be an object`); continue; }
    for (const [to, n] of Object.entries(o.links ?? {})) {
      if (!Object.hasOwn(d.objects, to)) errors.push(`objects.${name}.links.${to}: no such object`);
      if (n !== 'one' && n !== 'many') errors.push(`objects.${name}.links.${to}: must be "one" or "many"`);
    }
  }
  for (const [name, a] of Object.entries(d.actions)) {
    const at = `actions.${name}`;
    if (!NAME.test(name)) errors.push(`${at}: a name is lower case letters, digits and _`);
    if (!isObj(a)) { errors.push(`${at}: must be an object`); continue; }
    if (!Object.hasOwn(d.objects, a.object)) errors.push(`${at}.object: "${a.object}" is not an object of the definition`);
    if (!Array.isArray(a.actors) || a.actors.length === 0) errors.push(`${at}.actors: at least one actor`);
    else for (const who of a.actors) if (!Object.hasOwn(d.actors, who)) errors.push(`${at}.actors: "${who}" is not an actor of the definition`);
    if (typeof a.confirm !== 'boolean') errors.push(`${at}.confirm: must be true or false`);
    if (a.tool !== undefined && typeof a.tool !== 'boolean') errors.push(`${at}.tool: must be true or false`);
    if (a.tool && a.confirm) errors.push(`${at}: a tool (reading, searching) is never one the user confirms`);
    errors.push(...checkSchemaShape(a.params, `${at}.params`));
    if (isObj(a.params) && a.params.type !== 'object') errors.push(`${at}.params: must be an object schema`);
  }
  return errors;
}

export function loadDefinition({ path = DEFINITION_PATH } = {}) {
  let d;
  try {
    d = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new StreamsError('ontology-invalid', `the definition file cannot be read as JSON (${path}): ${e.message}`);
  }
  const errors = checkDefinition(d);
  if (errors.length) throw new StreamsError('ontology-invalid', `the definition file has ${errors.length} problem(s): ${errors.join('; ')}`, { problems: errors });
  return Object.freeze(d);
}

export function actionsFor(definition, actor) {
  return Object.entries(definition.actions)
    .filter(([, a]) => a.actors.includes(actor))
    .map(([name, a]) => ({ name, object: a.object, confirm: a.confirm, tool: a.tool === true, budget: a.budget ?? null, about: a.about ?? '', params: a.params }));
}
