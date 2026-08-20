import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const requestIdSchema = z.string().min(1).max(128).optional();
export const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

export const createTaskSchema = z
  .object({
    type: z.string().regex(/^[a-z][a-z0-9-]*$/),
    assignedUserId: uuidSchema,
  })
  .strict();

export const transitionTaskSchema = z
  .object({
    targetStatus: z.number().int().min(1),
    nextAssignedUserId: uuidSchema,
    expectedVersion: z.number().int().min(1),
    data: z.record(z.unknown()),
  })
  .strict();

export const closeTaskSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();

export const assignedTasksQuerySchema = z
  .object({
    state: z.enum(['ALL', 'OPEN', 'CLOSED']).default('ALL'),
    limit: limitSchema,
    cursor: z.string().min(1).max(1024).optional(),
  })
  .strict();

export const tasksQuerySchema = assignedTasksQuerySchema.extend({
  assignedUserId: uuidSchema.optional(),
});

export const pageQuerySchema = z
  .object({
    limit: limitSchema,
    cursor: z.string().min(1).max(1024).optional(),
  })
  .strict();
