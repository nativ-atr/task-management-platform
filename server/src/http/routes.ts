import type { Router } from 'express';
import express from 'express';
import type { DataSource } from 'typeorm';
import { requestFingerprint } from '../application/fingerprint.js';
import type { TaskPlatformService } from '../application/service.js';
import { errors } from '../domain/errors.js';
import {
  assignedTasksQuerySchema,
  closeTaskSchema,
  createTaskSchema,
  pageQuerySchema,
  tasksQuerySchema,
  transitionTaskSchema,
  uuidSchema,
} from './schemas.js';
import { parseBody, parseQuery, requireIdempotencyKey } from './middleware.js';

export function buildRouter(service: TaskPlatformService, db: DataSource): Router {
  const router = express.Router();

  router.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  router.get('/health/ready', async (_req, res, next) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      next(errors.serviceUnavailable());
    }
  });

  router.get('/api/v1/task-types', (_req, res) => res.json({ items: service.listTaskTypes() }));
  router.get('/api/v1/users', async (_req, res, next) => {
    try {
      res.json({ items: await service.listUsers() });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/api/v1/users/:userId/tasks',
    parseQuery(assignedTasksQuerySchema),
    async (req, res, next) => {
      try {
        const userId = uuidSchema.parse(req.params.userId);
        const query = assignedTasksQuerySchema.parse(req.query);
        res.json(
          await service.listTasks({
            assignedUserId: userId,
            state: query.state,
            limit: query.limit,
            cursorText: query.cursor,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/api/v1/tasks', parseQuery(tasksQuerySchema), async (req, res, next) => {
    try {
      const query = tasksQuerySchema.parse(req.query);
      res.json(
        await service.listTasks({
          assignedUserId: query.assignedUserId,
          state: query.state,
          limit: query.limit,
          cursorText: query.cursor,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/api/v1/tasks',
    requireIdempotencyKey,
    parseBody(createTaskSchema),
    async (req, res, next) => {
      try {
        const result = await service.createTask({
          ...req.body,
          idempotencyKey: req.header('Idempotency-Key') ?? '',
          fingerprint: requestFingerprint(req.method, req.path, req.body),
          requestId: String(res.locals.requestId),
        });
        res.setHeader('Idempotency-Replayed', String(result.replayed));
        res.status(result.status).json(result.body);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/api/v1/tasks/:taskId', async (req, res, next) => {
    try {
      const taskId = uuidSchema.parse(req.params.taskId);
      res.json(await service.getTask(taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/api/v1/tasks/:taskId/transitions',
    requireIdempotencyKey,
    parseBody(transitionTaskSchema),
    async (req, res, next) => {
      try {
        const taskId = uuidSchema.parse(req.params.taskId);
        const result = await service.transitionTask({
          taskId,
          ...req.body,
          idempotencyKey: req.header('Idempotency-Key') ?? '',
          fingerprint: requestFingerprint(req.method, req.path, req.body),
          requestId: String(res.locals.requestId),
        });
        res.setHeader('Idempotency-Replayed', String(result.replayed));
        res.status(result.status).json(result.body);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/api/v1/tasks/:taskId/close',
    requireIdempotencyKey,
    parseBody(closeTaskSchema),
    async (req, res, next) => {
      try {
        const taskId = uuidSchema.parse(req.params.taskId);
        const result = await service.closeTask({
          taskId,
          ...req.body,
          idempotencyKey: req.header('Idempotency-Key') ?? '',
          fingerprint: requestFingerprint(req.method, req.path, req.body),
          requestId: String(res.locals.requestId),
        });
        res.setHeader('Idempotency-Replayed', String(result.replayed));
        res.status(result.status).json(result.body);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/api/v1/tasks/:taskId/events',
    parseQuery(pageQuerySchema),
    async (req, res, next) => {
      try {
        const taskId = uuidSchema.parse(req.params.taskId);
        const query = pageQuerySchema.parse(req.query);
        res.json(await service.listTaskEvents(taskId, query.limit, query.cursor));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
