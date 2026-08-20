import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { errors } from '../domain/errors.js';
import { TaskTypeRegistry } from '../domain/registry.js';
import {
  availableActions,
  effectiveData,
  validateClose,
  validateTransition,
} from '../domain/workflow.js';
import {
  IdempotencyEntity,
  TaskEntity,
  TaskEventEntity,
  UserEntity,
  type IdempotencyRow,
  type TaskEventRow,
  type TaskRow,
  type UserRow,
} from '../infrastructure/entities.js';
import type { Env } from '../config/env.js';
import type { Page, TaskDto, TaskEventDto, TaskPageDto, TaskTypeDto, UserDto } from './dto.js';
import { toUserDto } from './dto.js';
import { decodeCursor, encodeCursor } from './pagination.js';

interface IdempotencyCommand<T> {
  key: string;
  fingerprint: string;
  requestId: string;
  execute(manager: EntityManager): Promise<{ status: number; body: T }>;
}

type IdempotencyResult<T> =
  { replayed: true; status: number; body: T } | { replayed: false; status: number; body: T };

export class TaskPlatformService {
  constructor(
    private readonly db: DataSource,
    private readonly registry: TaskTypeRegistry,
    private readonly env: Env,
  ) {}

  async listUsers(): Promise<UserDto[]> {
    const users = await this.db.getRepository(UserEntity).find({ order: { displayName: 'ASC' } });
    return users.map(toUserDto);
  }

  listTaskTypes(): TaskTypeDto[] {
    return this.registry.list().map((definition) => ({
      key: definition.key,
      label: definition.label,
      initialStatus: definition.initialStatus,
      finalStatus: definition.finalStatus,
      statuses: [...definition.statuses.values()].map((status) => ({
        status: status.status,
        label: status.label,
        fields: status.fields,
      })),
    }));
  }

  async getTask(id: string): Promise<TaskDto> {
    const task = await this.db.getRepository(TaskEntity).findOneBy({ id });
    if (!task) throw errors.taskNotFound();
    return this.toTaskDto(task);
  }

  async listAssignedTasks(
    userId: string,
    state: 'ALL' | 'OPEN' | 'CLOSED',
    limit: number,
    cursorText?: string,
  ): Promise<TaskPageDto> {
    return this.listTasks({ assignedUserId: userId, state, limit, cursorText });
  }

  async listTasks(command: {
    assignedUserId: string | undefined;
    state: 'ALL' | 'OPEN' | 'CLOSED';
    limit: number;
    cursorText: string | undefined;
  }): Promise<TaskPageDto> {
    if (command.assignedUserId) await this.requireUser(command.assignedUserId);
    const cursor = decodeCursor(command.cursorText);
    const baseQb = this.db.getRepository(TaskEntity).createQueryBuilder('task').where('1 = 1');
    if (command.assignedUserId) {
      baseQb.andWhere('task.assigned_user_id = :userId', { userId: command.assignedUserId });
    }
    if (command.state === 'OPEN') baseQb.andWhere('task.closed_at IS NULL');
    if (command.state === 'CLOSED') baseQb.andWhere('task.closed_at IS NOT NULL');

    const totalCount = await baseQb.clone().getCount();
    const qb = baseQb
      .clone()
      .orderBy('task.updated_at', 'DESC')
      .addOrderBy('task.id', 'DESC')
      .take(command.limit + 1);
    if (cursor) {
      qb.andWhere('(task.updated_at, task.id) < (:timestamp, :id)', cursor);
    }
    const rows = await qb.getMany();
    const pageRows = rows.slice(0, command.limit);
    return {
      items: await Promise.all(pageRows.map((task) => this.toTaskDto(task))),
      nextCursor:
        rows.length > command.limit
          ? encodeCursor({
              timestamp: pageRows[pageRows.length - 1]?.updatedAt.toISOString() ?? '',
              id: pageRows[pageRows.length - 1]?.id ?? '',
            })
          : null,
      totalCount,
    };
  }

  async listTaskEvents(
    taskId: string,
    limit: number,
    cursorText?: string,
  ): Promise<Page<TaskEventDto>> {
    const exists = await this.db.getRepository(TaskEntity).exist({ where: { id: taskId } });
    if (!exists) throw errors.taskNotFound();
    const cursor = decodeCursor(cursorText);
    const qb = this.db
      .getRepository(TaskEventEntity)
      .createQueryBuilder('event')
      .where('event.task_id = :taskId', { taskId })
      .orderBy('event.created_at', 'ASC')
      .addOrderBy('event.id', 'ASC')
      .take(limit + 1);
    if (cursor) {
      qb.andWhere('(event.created_at, event.id) > (:timestamp, :id)', cursor);
    }
    const rows = await qb.getMany();
    const pageRows = rows.slice(0, limit);
    return {
      items: pageRows.map(toTaskEventDto),
      nextCursor:
        rows.length > limit
          ? encodeCursor({
              timestamp: pageRows[pageRows.length - 1]?.createdAt.toISOString() ?? '',
              id: pageRows[pageRows.length - 1]?.id ?? '',
            })
          : null,
    };
  }

  async createTask(command: {
    type: string;
    assignedUserId: string;
    idempotencyKey: string;
    fingerprint: string;
    requestId: string;
  }): Promise<IdempotencyResult<TaskDto>> {
    return this.runIdempotent({
      key: command.idempotencyKey,
      fingerprint: command.fingerprint,
      requestId: command.requestId,
      execute: async (manager) => {
        const definition = this.registry.require(command.type);
        const user = await this.requireUser(command.assignedUserId, manager);
        const task = manager.create(TaskEntity, {
          id: randomUUID(),
          type: definition.key,
          currentStatus: 1,
          assignedUserId: user.id,
          customDataByStatus: {},
          closedAt: null,
          version: 1,
        });
        const saved = await manager.save(TaskEntity, task);
        await this.insertEvent(manager, {
          taskId: saved.id,
          eventType: 'TASK_CREATED',
          fromStatus: null,
          toStatus: 1,
          fromAssignedUserId: null,
          toAssignedUserId: user.id,
          payload: {},
          taskVersion: 1,
          requestId: command.requestId,
        });
        return { status: 201, body: await this.toTaskDto(saved, manager) };
      },
    });
  }

  async transitionTask(command: {
    taskId: string;
    targetStatus: number;
    nextAssignedUserId: string;
    expectedVersion: number;
    data: unknown;
    idempotencyKey: string;
    fingerprint: string;
    requestId: string;
  }): Promise<IdempotencyResult<TaskDto>> {
    return this.runIdempotent({
      key: command.idempotencyKey,
      fingerprint: command.fingerprint,
      requestId: command.requestId,
      execute: async (manager) => {
        const task = await this.lockTask(command.taskId, manager);
        if (task.version !== command.expectedVersion) throw errors.versionConflict();
        const definition = this.registry.require(task.type);
        const user = await this.requireUser(command.nextAssignedUserId, manager);
        const decision = validateTransition(definition, task, command.targetStatus, command.data);
        const nextData = {
          ...task.customDataByStatus,
          [String(command.targetStatus)]: decision.payload,
        };
        const fromStatus = task.currentStatus;
        const fromAssignedUserId = task.assignedUserId;
        task.currentStatus = command.targetStatus;
        task.assignedUserId = user.id;
        task.customDataByStatus = nextData;
        task.version += 1;
        const saved = await manager.save(TaskEntity, task);
        await this.insertEvent(manager, {
          taskId: task.id,
          eventType: 'STATUS_CHANGED',
          fromStatus,
          toStatus: command.targetStatus,
          fromAssignedUserId,
          toAssignedUserId: user.id,
          payload: decision.payload,
          taskVersion: saved.version,
          requestId: command.requestId,
        });
        return { status: 200, body: await this.toTaskDto(saved, manager) };
      },
    });
  }

  async closeTask(command: {
    taskId: string;
    expectedVersion: number;
    idempotencyKey: string;
    fingerprint: string;
    requestId: string;
  }): Promise<IdempotencyResult<TaskDto>> {
    return this.runIdempotent({
      key: command.idempotencyKey,
      fingerprint: command.fingerprint,
      requestId: command.requestId,
      execute: async (manager) => {
        const task = await this.lockTask(command.taskId, manager);
        if (task.version !== command.expectedVersion) throw errors.versionConflict();
        const definition = this.registry.require(task.type);
        validateClose(definition, task);
        const now = new Date();
        task.closedAt = now;
        task.version += 1;
        const saved = await manager.save(TaskEntity, task);
        await this.insertEvent(manager, {
          taskId: task.id,
          eventType: 'TASK_CLOSED',
          fromStatus: task.currentStatus,
          toStatus: task.currentStatus,
          fromAssignedUserId: task.assignedUserId,
          toAssignedUserId: task.assignedUserId,
          payload: {},
          taskVersion: saved.version,
          requestId: command.requestId,
        });
        return { status: 200, body: await this.toTaskDto(saved, manager) };
      },
    });
  }

  private async runIdempotent<T>(command: IdempotencyCommand<T>): Promise<IdempotencyResult<T>> {
    const reservation = await this.reserveIdempotency(command.key, command.fingerprint);
    if (reservation.kind === 'replay') {
      return { replayed: true, status: reservation.status, body: reservation.body as T };
    }

    const result = await this.db.transaction(async (manager) => {
      const executed = await command.execute(manager);
      const record = await manager
        .getRepository(IdempotencyEntity)
        .findOneByOrFail({ key: command.key });
      record.status = 'COMPLETED';
      record.responseStatus = executed.status;
      record.responseBody = executed.body as Record<string, unknown>;
      record.completedAt = new Date();
      record.lockedUntil = null;
      await manager.save(IdempotencyEntity, record);
      return executed;
    });

    return { replayed: false, status: result.status, body: result.body };
  }

  private async reserveIdempotency(
    key: string,
    fingerprint: string,
  ): Promise<{ kind: 'reserved' } | { kind: 'replay'; status: number; body: unknown }> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + this.env.IDEMPOTENCY_LEASE_SECONDS * 1000);
    const expiresAt = new Date(
      now.getTime() + this.env.IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000,
    );
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(IdempotencyEntity);
      const inserted = (await manager.query(
        `
          INSERT INTO idempotency_records
            (key, request_fingerprint, status, locked_until, expires_at)
          VALUES ($1, $2, 'IN_PROGRESS', $3, $4)
          ON CONFLICT (key) DO NOTHING
          RETURNING key
        `,
        [key, fingerprint, lockedUntil, expiresAt],
      )) as Array<{ key: string }>;
      if (inserted.length > 0) return { kind: 'reserved' };

      const existing = await repo.findOne({
        where: { key },
        lock: { mode: 'pessimistic_write' },
      });
      if (!existing) throw errors.idempotencyInProgress();
      return this.resolveIdempotencyRecord(
        existing,
        fingerprint,
        now,
        lockedUntil,
        expiresAt,
        repo,
      );
    });
  }

  private async resolveIdempotencyRecord(
    existing: IdempotencyRow,
    fingerprint: string,
    now: Date,
    lockedUntil: Date,
    expiresAt: Date,
    repo: Repository<IdempotencyRow>,
  ): Promise<{ kind: 'reserved' } | { kind: 'replay'; status: number; body: unknown }> {
    if (existing.requestFingerprint !== fingerprint) throw errors.idempotencyKeyReused();
    if (existing.status === 'COMPLETED') {
      return {
        kind: 'replay',
        status: existing.responseStatus ?? 200,
        body: existing.responseBody,
      };
    }
    if (existing.lockedUntil && existing.lockedUntil > now) {
      throw errors.idempotencyInProgress(
        Math.max(0, Math.ceil((existing.lockedUntil.getTime() - now.getTime()) / 1000)),
      );
    }
    existing.lockedUntil = lockedUntil;
    existing.expiresAt = expiresAt;
    await repo.save(existing);
    return { kind: 'reserved' };
  }

  private async lockTask(id: string, manager: EntityManager): Promise<TaskRow> {
    const task = await manager.getRepository(TaskEntity).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!task) throw errors.taskNotFound();
    return task;
  }

  private async requireUser(
    id: string,
    manager: EntityManager = this.db.manager,
  ): Promise<UserRow> {
    const user = await manager.getRepository(UserEntity).findOneBy({ id });
    if (!user) throw errors.userNotFound();
    return user;
  }

  private async insertEvent(
    manager: EntityManager,
    event: Omit<TaskEventRow, 'id' | 'createdAt'>,
  ): Promise<void> {
    await manager.save(
      TaskEventEntity,
      manager.create(TaskEventEntity, { id: randomUUID(), ...event }),
    );
  }

  private async toTaskDto(
    task: TaskRow,
    manager: EntityManager = this.db.manager,
  ): Promise<TaskDto> {
    const definition = this.registry.require(task.type);
    const status = definition.statuses.get(task.currentStatus);
    if (!status) throw errors.statusNotDefined();
    const user = await this.requireUser(task.assignedUserId, manager);
    return {
      id: task.id,
      type: definition.key,
      typeLabel: definition.label,
      currentStatus: task.currentStatus,
      currentStatusLabel: status.label,
      state: task.closedAt ? 'CLOSED' : 'OPEN',
      assignedUser: toUserDto(user),
      effectiveData: effectiveData(task),
      version: task.version,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      closedAt: task.closedAt?.toISOString() ?? null,
      availableActions: availableActions(definition, task.id, task),
    };
  }
}

function toTaskEventDto(event: TaskEventRow): TaskEventDto {
  return {
    id: event.id,
    taskId: event.taskId,
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    fromAssignedUserId: event.fromAssignedUserId,
    toAssignedUserId: event.toAssignedUserId,
    payload: event.payload,
    taskVersion: event.taskVersion,
    requestId: event.requestId,
    occurredAt: event.createdAt.toISOString(),
  };
}
