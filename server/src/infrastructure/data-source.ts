import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnv } from '../config/env.js';
import { InitialSchema1723970000000 } from '../../migrations/1723970000000-InitialSchema.js';
import { TaskListIndexes1723970100000 } from '../../migrations/1723970100000-TaskListIndexes.js';
import { IdempotencyEntity, TaskEntity, TaskEventEntity, UserEntity } from './entities.js';

export function createDataSource(databaseUrl = loadEnv().DATABASE_URL): DataSource {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [UserEntity, TaskEntity, TaskEventEntity, IdempotencyEntity],
    migrations: [InitialSchema1723970000000, TaskListIndexes1723970100000],
    synchronize: false,
    logging: false,
  });
}

export const AppDataSource = createDataSource();
