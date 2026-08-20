import crypto from 'node:crypto';

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

export function requestFingerprint(method: string, route: string, body: unknown): string {
  return crypto
    .createHash('sha256')
    .update(method.toUpperCase())
    .update('\n')
    .update(route)
    .update('\n')
    .update(stableJson(body ?? {}))
    .digest('hex');
}
