import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { requestFingerprint } from '../src/application/fingerprint.js';
import { TaskPlatformService } from '../src/application/service.js';
import { loadEnv } from '../src/config/env.js';
import {
  complianceDefinition,
  developmentDefinition,
  procurementDefinition,
} from '../src/domain/definitions.js';
import { AppError } from '../src/domain/errors.js';
import { TaskTypeRegistry } from '../src/domain/registry.js';
import { createDataSource } from '../src/infrastructure/data-source.js';
import { UserEntity, type UserRow } from '../src/infrastructure/entities.js';

const userRows: UserRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Avery Procurement',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Blake Development',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('application integration', () => {
  let db: DataSource;
  let service: TaskPlatformService;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    db = createDataSource();
    await db.initialize();
    await db.runMigrations();
    await db
      .createQueryBuilder()
      .insert()
      .into(UserEntity)
      .values(userRows)
      .orUpdate(['display_name', 'updated_at'], ['id'])
      .execute();
    const env = loadEnv();
    service = new TaskPlatformService(
      db,
      new TaskTypeRegistry([procurementDefinition, developmentDefinition, complianceDefinition]),
      env,
    );
    app = createApp(service, db, env);
  });

  afterAll(async () => {
    if (db.isInitialized) {
      await db.query(
        'DELETE FROM task_events WHERE task_id IN (SELECT id FROM tasks WHERE type = $1)',
        [complianceDefinition.key],
      );
      await db.query('DELETE FROM tasks WHERE type = $1', [complianceDefinition.key]);
      await db.destroy();
    }
  });

  it('commits task state, events, and idempotent replay atomically', async () => {
    const body = { type: 'procurement', assignedUserId: userRows[0].id };
    const createKey = randomUUID();
    const created = await service.createTask({
      ...body,
      idempotencyKey: createKey,
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', body),
      requestId: 'integration-create',
    });
    const replayed = await service.createTask({
      ...body,
      idempotencyKey: createKey,
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', body),
      requestId: 'integration-create-replay',
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.body.id).toBe(created.body.id);

    const transitioned = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 2,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: created.body.version,
      data: { quotes: ['one', 'two'] },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 2,
      }),
      requestId: 'integration-transition',
    });
    expect(transitioned.body.currentStatus).toBe(2);
    expect(transitioned.body.effectiveData['2']).toEqual({ quotes: ['one', 'two'] });

    await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 3,
      nextAssignedUserId: userRows[0].id,
      expectedVersion: transitioned.body.version,
      data: { receipt: 'done' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 3,
      }),
      requestId: 'integration-final',
    });
    const finalTask = await service.getTask(created.body.id);
    const closed = await service.closeTask({
      taskId: created.body.id,
      expectedVersion: finalTask.version,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/close`, {
        expectedVersion: finalTask.version,
      }),
      requestId: 'integration-close',
    });
    expect(closed.body.state).toBe('CLOSED');

    const events = await service.listTaskEvents(created.body.id, 10);
    expect(events.items.map((event) => event.eventType)).toEqual([
      'TASK_CREATED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
      'TASK_CLOSED',
    ]);
  });

  it('returns in-progress for a concurrent first-use identical idempotency key', async () => {
    const body = { type: 'procurement', assignedUserId: userRows[0].id };
    const key = randomUUID();
    await installTaskInsertDelay(db);
    try {
      const first = request(app)
        .post('/api/v1/tasks')
        .set('Idempotency-Key', key)
        .send(body)
        .then((response) => response);
      await waitForIdempotencyStatus(db, key, 'IN_PROGRESS');

      const duplicate = await request(app)
        .post('/api/v1/tasks')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(409);
      expect(duplicate.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(duplicate.headers['retry-after']).toBeDefined();

      const created = await first;
      expect(created.status).toBe(201);
      expect(created.body.type).toBe('procurement');
    } finally {
      await removeTaskInsertDelay(db);
    }
  });

  it('replays completed HTTP requests and rejects idempotency key reuse', async () => {
    const body = { type: 'procurement', assignedUserId: userRows[0].id };
    const key = randomUUID();
    const created = await request(app)
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const replayed = await request(app)
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(replayed.headers['idempotency-replayed']).toBe('true');
    expect(replayed.body.id).toBe(created.body.id);

    const reused = await request(app)
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ type: 'procurement', assignedUserId: userRows[1].id })
      .expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('replays a delayed duplicate transition without mutating the current task state', async () => {
    const created = await request(app)
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'procurement', assignedUserId: userRows[0].id })
      .expect(201);
    const transitionKey = randomUUID();
    const transitionBody = {
      targetStatus: 2,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: created.body.version,
      data: { quotes: ['first', 'second'] },
    };

    const transitioned = await request(app)
      .post(`/api/v1/tasks/${created.body.id}/transitions`)
      .set('Idempotency-Key', transitionKey)
      .send(transitionBody)
      .expect(200);
    await request(app)
      .post(`/api/v1/tasks/${created.body.id}/transitions`)
      .set('Idempotency-Key', randomUUID())
      .send({
        targetStatus: 1,
        nextAssignedUserId: userRows[0].id,
        expectedVersion: transitioned.body.version,
        data: {},
      })
      .expect(200);

    const duplicate = await request(app)
      .post(`/api/v1/tasks/${created.body.id}/transitions`)
      .set('Idempotency-Key', transitionKey)
      .send(transitionBody)
      .expect(200);
    expect(duplicate.headers['idempotency-replayed']).toBe('true');
    expect(duplicate.body.currentStatus).toBe(2);
    expect(duplicate.body.version).toBe(transitioned.body.version);

    const current = await request(app).get(`/api/v1/tasks/${created.body.id}`).expect(200);
    expect(current.body.currentStatus).toBe(1);
    expect(current.body.version).toBe(transitioned.body.version + 1);
  });

  it('runs Compliance through the same API, service, workflow, and persistence model', async () => {
    const taskTypes = await request(app).get('/api/v1/task-types').expect(200);
    expect(taskTypes.body.items).toContainEqual(
      expect.objectContaining({
        key: 'compliance',
        label: 'Compliance',
        finalStatus: 5,
        statuses: expect.arrayContaining([
          expect.objectContaining({
            status: 3,
            label: 'Documents verified',
            fields: [
              {
                kind: 'TEXT',
                name: 'documentNotes',
                label: 'Document notes',
                required: true,
                minLength: 1,
              },
            ],
          }),
        ]),
      }),
    );

    const createBody = { type: 'compliance', assignedUserId: userRows[0].id };
    const created = await service.createTask({
      ...createBody,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', createBody),
      requestId: 'compliance-create',
    });
    expect(created.body.type).toBe('compliance');
    expect(created.body.availableActions.transitions).toContainEqual(
      expect.objectContaining({
        targetStatus: 2,
        targetLabel: 'Intake completed',
        requiredFields: [
          {
            kind: 'TEXT',
            name: 'caseReference',
            label: 'Case reference',
            required: true,
            minLength: 1,
          },
        ],
      }),
    );

    await expect(
      service.transitionTask({
        taskId: created.body.id,
        targetStatus: 3,
        nextAssignedUserId: userRows[1].id,
        expectedVersion: created.body.version,
        data: { documentNotes: 'documents look complete' },
        idempotencyKey: randomUUID(),
        fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
          targetStatus: 3,
          marker: 'skip',
        }),
        requestId: 'compliance-skip',
      }),
    ).rejects.toMatchObject({ code: 'FORWARD_SKIP_NOT_ALLOWED' });
    await expect(
      service.transitionTask({
        taskId: created.body.id,
        targetStatus: 1,
        nextAssignedUserId: userRows[1].id,
        expectedVersion: created.body.version,
        data: {},
        idempotencyKey: randomUUID(),
        fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
          targetStatus: 1,
          marker: 'same',
        }),
        requestId: 'compliance-same-status',
      }),
    ).rejects.toMatchObject({ code: 'SAME_STATUS_TRANSITION' });
    await expect(
      service.closeTask({
        taskId: created.body.id,
        expectedVersion: created.body.version,
        idempotencyKey: randomUUID(),
        fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/close`, {
          expectedVersion: created.body.version,
          marker: 'premature',
        }),
        requestId: 'compliance-premature-close',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FINAL_STATUS' });

    const intake = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 2,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: created.body.version,
      data: { caseReference: ' CASE-1 ' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 2,
      }),
      requestId: 'compliance-intake',
    });
    expect(intake.body.assignedUser.id).toBe(userRows[1].id);
    expect(intake.body.effectiveData['2']).toEqual({ caseReference: 'CASE-1' });

    const documents = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 3,
      nextAssignedUserId: userRows[0].id,
      expectedVersion: intake.body.version,
      data: { documentNotes: ' Initial document notes ' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 3,
      }),
      requestId: 'compliance-documents',
    });
    expect(documents.body.assignedUser.id).toBe(userRows[0].id);
    expect(documents.body.effectiveData['3']).toEqual({ documentNotes: 'Initial document notes' });

    const reviewed = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 4,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: documents.body.version,
      data: { reviewNotes: 'Looks complete' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 4,
      }),
      requestId: 'compliance-review',
    });
    expect(reviewed.body.assignedUser.id).toBe(userRows[1].id);

    const backToIntake = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 2,
      nextAssignedUserId: userRows[0].id,
      expectedVersion: reviewed.body.version,
      data: { caseReference: 'CASE-2' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 2,
        marker: 'back',
      }),
      requestId: 'compliance-back',
    });
    expect(backToIntake.body.assignedUser.id).toBe(userRows[0].id);
    expect(backToIntake.body.effectiveData).toEqual({ '2': { caseReference: 'CASE-2' } });
    expect(backToIntake.body.availableActions.transitions).toContainEqual(
      expect.objectContaining({
        targetStatus: 3,
        currentValues: { documentNotes: 'Initial document notes' },
      }),
    );

    const documentsReentry = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 3,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: backToIntake.body.version,
      data: { documentNotes: 'Replacement document notes' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 3,
        marker: 'reentry',
      }),
      requestId: 'compliance-documents-reentry',
    });
    const reviewReentry = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 4,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: documentsReentry.body.version,
      data: { reviewNotes: 'Re-reviewed' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 4,
        marker: 'reentry',
      }),
      requestId: 'compliance-review-reentry',
    });
    const approved = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 5,
      nextAssignedUserId: userRows[0].id,
      expectedVersion: reviewReentry.body.version,
      data: { approvalReference: 'APP-1' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 5,
      }),
      requestId: 'compliance-approval',
    });
    expect(approved.body.availableActions.close).not.toBeNull();
    expect(approved.body.assignedUser.id).toBe(userRows[0].id);

    const closed = await service.closeTask({
      taskId: created.body.id,
      expectedVersion: approved.body.version,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/close`, {
        expectedVersion: approved.body.version,
      }),
      requestId: 'compliance-close',
    });
    expect(closed.body.currentStatus).toBe(5);
    expect(closed.body.assignedUser.id).toBe(approved.body.assignedUser.id);
    expect(closed.body.effectiveData).toEqual(approved.body.effectiveData);
    expect(closed.body.availableActions).toEqual({ transitions: [], close: null });

    const events = await service.listTaskEvents(created.body.id, 20);
    expect(events.items.map((event) => event.toAssignedUserId)).toEqual([
      userRows[0].id,
      userRows[1].id,
      userRows[0].id,
      userRows[1].id,
      userRows[0].id,
      userRows[1].id,
      userRows[1].id,
      userRows[0].id,
      userRows[0].id,
    ]);
    expect(events.items.at(-1)).toEqual(
      expect.objectContaining({
        eventType: 'TASK_CLOSED',
        toStatus: 5,
        toAssignedUserId: approved.body.assignedUser.id,
        payload: {},
        taskVersion: approved.body.version + 1,
      }),
    );
  });

  it('allows only one competing transition from a task version to commit', async () => {
    const createBody = { type: 'procurement', assignedUserId: userRows[0].id };
    const created = await service.createTask({
      ...createBody,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', createBody),
      requestId: 'race-create',
    });
    const commands = ['a', 'b'].map((suffix) =>
      service.transitionTask({
        taskId: created.body.id,
        targetStatus: 2,
        nextAssignedUserId: userRows[1].id,
        expectedVersion: created.body.version,
        data: { quotes: [`${suffix}1`, `${suffix}2`] },
        idempotencyKey: randomUUID(),
        fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
          suffix,
        }),
        requestId: `race-${suffix}`,
      }),
    );
    const settled = await Promise.allSettled(commands);
    const fulfilled = settled.filter((result) => result.status === 'fulfilled');
    const rejected = settled.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    expect(((rejected[0] as PromiseRejectedResult).reason as AppError).code).toBe(
      'VERSION_CONFLICT',
    );
  });

  it('preserves Development distribution payload when closing', async () => {
    const created = await service.createTask({
      type: 'development',
      assignedUserId: userRows[0].id,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', {
        marker: 'development-close-payload',
      }),
      requestId: 'development-close-create',
    });
    const specified = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 2,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: created.body.version,
      data: { specification: 'spec' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 2,
      }),
      requestId: 'development-close-spec',
    });
    const developed = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 3,
      nextAssignedUserId: userRows[0].id,
      expectedVersion: specified.body.version,
      data: { branchName: 'feature/distribution-version' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 3,
      }),
      requestId: 'development-close-dev',
    });
    const distributed = await service.transitionTask({
      taskId: created.body.id,
      targetStatus: 4,
      nextAssignedUserId: userRows[1].id,
      expectedVersion: developed.body.version,
      data: { version: '2.4.0' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/transitions`, {
        targetStatus: 4,
      }),
      requestId: 'development-close-distribute',
    });

    await request(app)
      .post(`/api/v1/tasks/${created.body.id}/close`)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: distributed.body.version, data: { version: '1.2.3' } })
      .expect(400);

    const afterRejectedCloseBody = await service.getTask(created.body.id);
    expect(afterRejectedCloseBody.version).toBe(distributed.body.version);
    expect(afterRejectedCloseBody.currentStatus).toBe(4);
    expect(afterRejectedCloseBody.assignedUser.id).toBe(userRows[1].id);
    expect(afterRejectedCloseBody.effectiveData['4']).toEqual({ version: '2.4.0' });

    const closed = await service.closeTask({
      taskId: created.body.id,
      expectedVersion: distributed.body.version,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${created.body.id}/close`, {
        expectedVersion: distributed.body.version,
      }),
      requestId: 'development-close',
    });
    expect(closed.body.version).toBe(distributed.body.version + 1);
    expect(closed.body.currentStatus).toBe(distributed.body.currentStatus);
    expect(closed.body.assignedUser.id).toBe(distributed.body.assignedUser.id);
    expect(closed.body.effectiveData['4']).toEqual({ version: '2.4.0' });

    const events = await service.listTaskEvents(created.body.id, 20);
    const closeEvent = events.items.at(-1);
    expect(closeEvent).toEqual(
      expect.objectContaining({
        eventType: 'TASK_CLOSED',
        toStatus: 4,
        toAssignedUserId: distributed.body.assignedUser.id,
        payload: {},
        taskVersion: distributed.body.version + 1,
      }),
    );
    expect(events.items.map((event) => event.payload)).not.toContainEqual({ version: '1.2.3' });
  });

  it('lists all tasks with composable filters, totalCount, pagination, and compatibility route parity', async () => {
    const openUserZero = await service.createTask({
      type: 'procurement',
      assignedUserId: userRows[0].id,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', { marker: 'open-user-zero' }),
      requestId: 'list-open-user-zero',
    });
    const openUserOne = await service.createTask({
      type: 'development',
      assignedUserId: userRows[1].id,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', { marker: 'open-user-one' }),
      requestId: 'list-open-user-one',
    });
    const closingTask = await service.createTask({
      type: 'procurement',
      assignedUserId: userRows[0].id,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', { marker: 'closed-user-zero' }),
      requestId: 'list-closed-create',
    });
    const statusTwo = await service.transitionTask({
      taskId: closingTask.body.id,
      targetStatus: 2,
      nextAssignedUserId: userRows[0].id,
      expectedVersion: closingTask.body.version,
      data: { quotes: ['left', 'right'] },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${closingTask.body.id}/transitions`, {
        targetStatus: 2,
      }),
      requestId: 'list-closed-status-two',
    });
    const final = await service.transitionTask({
      taskId: closingTask.body.id,
      targetStatus: 3,
      nextAssignedUserId: userRows[0].id,
      expectedVersion: statusTwo.body.version,
      data: { receipt: 'receipt' },
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${closingTask.body.id}/transitions`, {
        targetStatus: 3,
      }),
      requestId: 'list-closed-final',
    });
    const closed = await service.closeTask({
      taskId: closingTask.body.id,
      expectedVersion: final.body.version,
      idempotencyKey: randomUUID(),
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${closingTask.body.id}/close`, {
        expectedVersion: final.body.version,
      }),
      requestId: 'list-close',
    });

    const allFirstPage = await service.listTasks({
      assignedUserId: undefined,
      state: 'ALL',
      limit: 1,
      cursorText: undefined,
    });
    expect(allFirstPage.items).toHaveLength(1);
    expect(allFirstPage.nextCursor).not.toBeNull();
    expect(allFirstPage.totalCount ?? 0).toBeGreaterThanOrEqual(3);

    const userZeroOpen = await service.listTasks({
      assignedUserId: userRows[0].id,
      state: 'OPEN',
      limit: 50,
      cursorText: undefined,
    });
    expect(userZeroOpen.items.map((task) => task.id)).toContain(openUserZero.body.id);
    expect(userZeroOpen.items.map((task) => task.id)).not.toContain(closed.body.id);

    const userOneAll = await service.listTasks({
      assignedUserId: userRows[1].id,
      state: 'ALL',
      limit: 50,
      cursorText: undefined,
    });
    expect(userOneAll.items.map((task) => task.id)).toContain(openUserOne.body.id);

    const genericClosed = await request(app)
      .get('/api/v1/tasks')
      .query({ assignedUserId: userRows[0].id, state: 'CLOSED' })
      .expect(200);
    const compatibilityClosed = await request(app)
      .get(`/api/v1/users/${userRows[0].id}/tasks`)
      .query({ state: 'CLOSED' })
      .expect(200);
    expect(genericClosed.body.totalCount).toBe(compatibilityClosed.body.totalCount);
    expect(genericClosed.body.items.map((task: { id: string }) => task.id)).toEqual(
      compatibilityClosed.body.items.map((task: { id: string }) => task.id),
    );
    expect(genericClosed.body.items.map((task: { id: string }) => task.id)).toContain(
      closed.body.id,
    );
  });

  it('validates task-list query users and exposes supporting indexes', async () => {
    await request(app).get('/api/v1/tasks?assignedUserId=not-a-uuid').expect(400);
    const missingUser = await request(app)
      .get('/api/v1/tasks?assignedUserId=99999999-9999-4999-8999-999999999999')
      .expect(404);
    expect(missingUser.body.error.code).toBe('USER_NOT_FOUND');

    const indexes = await db.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'tasks' ORDER BY indexname",
    );
    expect(indexes.map((row: { indexname: string }) => row.indexname)).toEqual(
      expect.arrayContaining([
        'idx_tasks_assignee_state_updated',
        'idx_tasks_updated',
        'idx_tasks_open_updated',
        'idx_tasks_closed_updated',
      ]),
    );

    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query('SET LOCAL enable_seqscan = off');
      const allPlan = await runner.query(
        'EXPLAIN SELECT id FROM tasks ORDER BY updated_at DESC, id DESC LIMIT 20',
      );
      const openPlan = await runner.query(
        'EXPLAIN SELECT id FROM tasks WHERE closed_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 20',
      );
      const assigneePlan = await runner.query(
        'EXPLAIN SELECT id FROM tasks WHERE assigned_user_id = $1 AND closed_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 20',
        [userRows[0].id],
      );
      await runner.rollbackTransaction();

      const planText = [allPlan, openPlan, assigneePlan]
        .flat()
        .map((row: { 'QUERY PLAN': string }) => row['QUERY PLAN'])
        .join('\n');
      expect(planText).toContain('idx_tasks_updated');
      expect(planText).toContain('idx_tasks_open_updated');
      expect(planText).toContain('idx_tasks_assignee_state_updated');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});

async function installTaskInsertDelay(db: DataSource): Promise<void> {
  await db.query(`
    CREATE OR REPLACE FUNCTION test_sleep_on_task_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM pg_sleep(1);
      RETURN NEW;
    END;
    $$;
  `);
  await db.query('DROP TRIGGER IF EXISTS test_sleep_on_task_insert ON tasks');
  await db.query(`
    CREATE TRIGGER test_sleep_on_task_insert
    BEFORE INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION test_sleep_on_task_insert()
  `);
}

async function removeTaskInsertDelay(db: DataSource): Promise<void> {
  await db.query('DROP TRIGGER IF EXISTS test_sleep_on_task_insert ON tasks');
  await db.query('DROP FUNCTION IF EXISTS test_sleep_on_task_insert()');
}

async function waitForIdempotencyStatus(
  db: DataSource,
  key: string,
  status: 'IN_PROGRESS' | 'COMPLETED',
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = (await db.query('SELECT status FROM idempotency_records WHERE key = $1', [
      key,
    ])) as Array<{ status: string }>;
    if (rows[0]?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for idempotency key ${key} to become ${status}`);
}
