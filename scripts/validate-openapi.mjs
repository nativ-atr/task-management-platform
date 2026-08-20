import fs from 'node:fs';
import YAML from 'yaml';

const text = fs.readFileSync(new URL('../docs/api/openapi.yaml', import.meta.url), 'utf8');
const doc = YAML.parse(text);
const routesText = fs.readFileSync(
  new URL('../server/src/http/routes.ts', import.meta.url),
  'utf8',
);
const errorsText = fs.readFileSync(
  new URL('../server/src/domain/errors.ts', import.meta.url),
  'utf8',
);

const requiredPaths = [
  '/health/live',
  '/health/ready',
  '/api/v1/task-types',
  '/api/v1/users',
  '/api/v1/users/{userId}/tasks',
  '/api/v1/tasks',
  '/api/v1/tasks/{taskId}',
  '/api/v1/tasks/{taskId}/transitions',
  '/api/v1/tasks/{taskId}/close',
  '/api/v1/tasks/{taskId}/events',
];

if (doc.openapi !== '3.1.0') throw new Error('OpenAPI version must be 3.1.0');
for (const path of requiredPaths) {
  if (!doc.paths?.[path]) throw new Error(`Missing path ${path}`);
}
if (!doc.paths?.['/api/v1/tasks']?.get) throw new Error('Missing GET /api/v1/tasks');
if (!doc.components?.schemas?.ErrorResponse) throw new Error('Missing ErrorResponse schema');
if (!doc.components?.schemas?.TaskPage?.required?.includes('totalCount')) {
  throw new Error('TaskPage must require totalCount');
}

expectSameSet(
  extractExpressOperations(routesText),
  extractOpenApiOperations(doc),
  'OpenAPI operations must match Express route methods and paths',
);
expectSameSet(
  extractErrorCodes(errorsText),
  doc.components?.schemas?.ErrorObject?.properties?.code?.enum ?? [],
  'OpenAPI error-code enum must match the ErrorCode union',
);

console.log('OpenAPI contract parsed and implementation drift checks passed.');

function extractExpressOperations(source) {
  const operations = [];
  const routePattern = /router\.(get|post)\(\s*['`]([^'`]+)['`]/g;
  for (const match of source.matchAll(routePattern)) {
    const method = match[1].toUpperCase();
    const route = match[2].replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}');
    operations.push(`${method} ${route}`);
  }
  return operations.sort();
}

function extractOpenApiOperations(openapi) {
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const operations = [];
  for (const [path, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const method of Object.keys(pathItem ?? {})) {
      if (methods.has(method)) operations.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return operations.sort();
}

function extractErrorCodes(source) {
  return [...source.matchAll(/\|\s*'([A-Z_]+)'/g)].map((match) => match[1]).sort();
}

function expectSameSet(left, right, message) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const missing = [...leftSet].filter((item) => !rightSet.has(item));
  const extra = [...rightSet].filter((item) => !leftSet.has(item));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${message}.\nMissing: ${missing.join(', ') || '(none)'}\nExtra: ${
        extra.join(', ') || '(none)'
      }`,
    );
  }
}
