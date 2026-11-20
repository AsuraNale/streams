// The small subset of JSON Schema the definition file uses for an action's params (core/src/ontology/streams.json).
// checkSchemaShape(schema, at) -> [error]   the schema itself is one this module understands
// validate(schema, value, at)  -> [error]   the value fits it; each error names where ("params.source.name: …")
// Supported: type (object string array number integer boolean), required, properties, additionalProperties: false,
// items, minItems, maxItems, minLength, maxLength, enum. Anything else in a schema is a definition error, so a rule
// written in the file is never silently ignored.
export const TYPES = Object.freeze(['object', 'string', 'array', 'number', 'integer', 'boolean']);
const KEYS = new Set(['type', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'enum', 'description']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function checkSchemaShape(schema, at = 'params') {
  const errors = [];
  if (!isObj(schema)) return [`${at}: a schema must be an object`];
  for (const k of Object.keys(schema)) if (!KEYS.has(k)) errors.push(`${at}: "${k}" is not a schema keyword this file may use`);
  if (!TYPES.includes(schema.type)) errors.push(`${at}: type must be one of ${TYPES.join(' / ')}`);
  if (schema.required !== undefined && !(Array.isArray(schema.required) && schema.required.every((r) => typeof r === 'string'))) errors.push(`${at}: required must be a list of names`);
  if (schema.properties !== undefined) {
    if (!isObj(schema.properties)) errors.push(`${at}: properties must be an object`);
    else for (const [k, s] of Object.entries(schema.properties)) errors.push(...checkSchemaShape(s, `${at}.${k}`));
    for (const r of schema.required ?? []) if (isObj(schema.properties) && !Object.hasOwn(schema.properties, r)) errors.push(`${at}: required "${r}" is not among the properties`);
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) errors.push(`${at}: additionalProperties may only be false`);
  if (schema.items !== undefined) errors.push(...checkSchemaShape(schema.items, `${at}[]`));
  for (const k of ['minItems', 'maxItems', 'minLength', 'maxLength']) if (schema[k] !== undefined && !(Number.isInteger(schema[k]) && schema[k] >= 0)) errors.push(`${at}: ${k} must be a whole number`);
  if (schema.enum !== undefined && !(Array.isArray(schema.enum) && schema.enum.length > 0)) errors.push(`${at}: enum must be a non-empty list`);
  return errors;
}

function typeOk(type, v) {
  switch (type) {
    case 'object': return isObj(v);
    case 'array': return Array.isArray(v);
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    default: return false;
  }
}

export function validate(schema, value, at = 'params') {
  if (!typeOk(schema.type, value)) return [`${at}: must be ${schema.type === 'array' || schema.type === 'object' ? 'an' : 'a'} ${schema.type}`];
  const errors = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: must be one of ${schema.enum.join(' / ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) errors.push(`${at}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${at}[${i}]`)));
  }
  if (isObj(value)) {
    for (const r of schema.required ?? []) if (!Object.hasOwn(value, r)) errors.push(`${at}.${r}: missing`);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (Object.hasOwn(props, k)) errors.push(...validate(props[k], v, `${at}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${k}: not a field of this action`);
    }
  }
  return errors;
}
