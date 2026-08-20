import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';
import { AppError, errors } from '../domain/errors.js';
import { idempotencyKeySchema } from './schemas.js';

export const requestLogger = pinoHttp({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.idempotency-key',
      'req.body.data',
    ],
    remove: true,
  },
  genReqId(req: Request, res: Response) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
});

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  res.locals.requestId =
    typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  next();
}

export function parseBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return next(
        errors.badRequest('The request body is invalid.', { issues: parsed.error.issues }),
      );
    req.body = parsed.data;
    next();
  };
}

export function parseQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success)
      return next(
        errors.badRequest('The query string is invalid.', { issues: parsed.error.issues }),
      );
    req.query = parsed.data as Request['query'];
    next();
  };
}

export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.header('Idempotency-Key');
  if (!key) return next(errors.badRequest('Idempotency-Key is required.'));
  const validation = idempotencyKeySchema.safeParse(key);
  if (!validation.success) return next(errors.badRequest('Idempotency-Key is invalid.'));
  next();
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  void _next;
  const requestIdValue = String(
    res.locals.requestId ?? res.getHeader('X-Request-Id') ?? randomUUID(),
  );
  if (err instanceof AppError) {
    if (err.code === 'IDEMPOTENCY_IN_PROGRESS' && typeof err.details.retryAfter === 'number') {
      res.setHeader('Retry-After', String(err.details.retryAfter));
    }
    res.status(err.httpStatus).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: requestIdValue,
      },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'The request is malformed.',
        details: { issues: err.issues },
        requestId: requestIdValue,
      },
    });
    return;
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: {},
      requestId: requestIdValue,
    },
  });
}
