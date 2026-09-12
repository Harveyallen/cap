/** Zero-dependency checks for the JSON Schema subset used by data/catalog.schema.json. */

function matchesType(value, type) {
  switch (type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

export function catalogErrors(value, schema, path = '#') {
  if (!schema || typeof schema !== 'object') return [];
  const errors = [];

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(', ')}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match ${schema.pattern}`);
    }
  }

  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }

  const checkObject = schema.type === 'object'
    || schema.properties
    || schema.required
    || schema.additionalProperties === false;
  if (checkObject && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}: missing required ${key}`);
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}: unexpected field ${key}`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        errors.push(...catalogErrors(value[key], child, `${path}/${key}`));
      }
    }
  }

  const checkArray = schema.type === 'array' || schema.items || schema.minItems != null;
  if (checkArray && Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...catalogErrors(item, schema.items, `${path}/${index}`));
      });
    }
  }

  return errors;
}

export function validateCatalog(catalog, schema) {
  const errors = catalogErrors(catalog, schema);
  if (errors.length) {
    const error = new Error(`Invalid catalog: ${errors[0]}`);
    error.errors = errors;
    throw error;
  }
  return catalog;
}
