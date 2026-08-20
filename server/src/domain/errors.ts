export type ErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_CURSOR'
  | 'TASK_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'TASK_TYPE_NOT_FOUND'
  | 'STATUS_NOT_DEFINED'
  | 'PAYLOAD_VALIDATION_FAILED'
  | 'INVALID_TRANSITION'
  | 'SAME_STATUS_TRANSITION'
  | 'FORWARD_SKIP_NOT_ALLOWED'
  | 'TASK_CLOSED'
  | 'NOT_FINAL_STATUS'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const errors = {
  badRequest: (message = 'The request is malformed.', details: Record<string, unknown> = {}) =>
    new AppError('BAD_REQUEST', message, 400, details),
  invalidCursor: () => new AppError('INVALID_CURSOR', 'The cursor is invalid.', 400),
  taskNotFound: () => new AppError('TASK_NOT_FOUND', 'Task not found.', 404),
  userNotFound: () => new AppError('USER_NOT_FOUND', 'User not found.', 404),
  taskTypeNotFound: () => new AppError('TASK_TYPE_NOT_FOUND', 'Task type not found.', 422),
  statusNotDefined: () => new AppError('STATUS_NOT_DEFINED', 'Target status is not defined.', 422),
  payloadValidationFailed: (details: Record<string, unknown> = {}) =>
    new AppError('PAYLOAD_VALIDATION_FAILED', 'The target payload is invalid.', 422, details),
  invalidTransition: (message = 'The transition is not allowed.') =>
    new AppError('INVALID_TRANSITION', message, 409),
  sameStatusTransition: () =>
    new AppError('SAME_STATUS_TRANSITION', 'Same-status transitions are invalid.', 409),
  forwardSkipNotAllowed: () =>
    new AppError(
      'FORWARD_SKIP_NOT_ALLOWED',
      'Forward transitions must move exactly one status.',
      409,
    ),
  taskClosed: () => new AppError('TASK_CLOSED', 'Closed tasks are immutable.', 409),
  notFinalStatus: () => new AppError('NOT_FINAL_STATUS', 'Task is not at its final status.', 409),
  versionConflict: () =>
    new AppError('VERSION_CONFLICT', 'The task has changed since it was read.', 409),
  idempotencyKeyReused: () =>
    new AppError(
      'IDEMPOTENCY_KEY_REUSED',
      'The idempotency key was reused for a different request.',
      409,
    ),
  idempotencyInProgress: (retryAfter?: number) =>
    new AppError(
      'IDEMPOTENCY_IN_PROGRESS',
      'An identical request is already in progress.',
      409,
      retryAfter === undefined ? {} : { retryAfter },
    ),
  serviceUnavailable: () =>
    new AppError('SERVICE_UNAVAILABLE', 'A dependency is unavailable.', 503),
};
