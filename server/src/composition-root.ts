import type { DataSource } from 'typeorm';
import { TaskPlatformService } from './application/service.js';
import type { Env } from './config/env.js';
import {
  complianceDefinition,
  developmentDefinition,
  procurementDefinition,
} from './domain/definitions.js';
import { TaskTypeRegistry } from './domain/registry.js';

export function compose(db: DataSource, env: Env): TaskPlatformService {
  const registry = new TaskTypeRegistry([
    procurementDefinition,
    developmentDefinition,
    complianceDefinition,
  ]);
  return new TaskPlatformService(db, registry, env);
}
