import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { DataSource } from 'typeorm';
import type { TaskPlatformService } from './application/service.js';
import type { Env } from './config/env.js';
import { buildDocsRouter } from './http/docs.js';
import { errorHandler, requestId, requestLogger } from './http/middleware.js';
import { buildRouter } from './http/routes.js';

export function createApp(service: TaskPlatformService, db: DataSource, env: Env): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT, strict: true }));
  app.use(requestId);
  app.use(requestLogger);
  app.use(buildDocsRouter());
  app.use(buildRouter(service, db));
  app.use(errorHandler);
  return app;
}
