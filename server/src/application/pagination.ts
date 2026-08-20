import { errors } from '../domain/errors.js';

export interface Cursor {
  timestamp: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(input: string | undefined): Cursor | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(Buffer.from(input, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.timestamp !== 'string' || typeof parsed.id !== 'string') throw new Error();
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    throw errors.invalidCursor();
  }
}
