import { EntitySchema } from 'typeorm';

export interface UserRow {
  id: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskRow {
  id: string;
  type: string;
  currentStatus: number;
  assignedUserId: string;
  customDataByStatus: Record<string, Record<string, unknown>>;
  closedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskEventRow {
  id: string;
  taskId: string;
  eventType: 'TASK_CREATED' | 'STATUS_CHANGED' | 'TASK_CLOSED';
  fromStatus: number | null;
  toStatus: number;
  fromAssignedUserId: string | null;
  toAssignedUserId: string;
  payload: Record<string, unknown>;
  taskVersion: number;
  requestId: string;
  createdAt: Date;
}

export interface IdempotencyRow {
  key: string;
  requestFingerprint: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
  lockedUntil: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export const UserEntity = new EntitySchema<UserRow>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true },
    displayName: { name: 'display_name', type: String },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});

export const TaskEntity = new EntitySchema<TaskRow>({
  name: 'Task',
  tableName: 'tasks',
  columns: {
    id: { type: 'uuid', primary: true },
    type: { type: String },
    currentStatus: { name: 'current_status', type: Number },
    assignedUserId: { name: 'assigned_user_id', type: 'uuid' },
    customDataByStatus: { name: 'custom_data_by_status', type: 'jsonb', default: {} },
    closedAt: { name: 'closed_at', type: 'timestamptz', nullable: true },
    version: { type: Number },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
  indices: [
    {
      name: 'idx_tasks_assignee_state_updated',
      columns: ['assignedUserId', 'closedAt', 'updatedAt', 'id'],
    },
    { name: 'idx_tasks_updated', columns: ['updatedAt', 'id'] },
  ],
});

export const TaskEventEntity = new EntitySchema<TaskEventRow>({
  name: 'TaskEvent',
  tableName: 'task_events',
  columns: {
    id: { type: 'uuid', primary: true },
    taskId: { name: 'task_id', type: 'uuid' },
    eventType: { name: 'event_type', type: String },
    fromStatus: { name: 'from_status', type: Number, nullable: true },
    toStatus: { name: 'to_status', type: Number },
    fromAssignedUserId: { name: 'from_assignee_id', type: 'uuid', nullable: true },
    toAssignedUserId: { name: 'to_assignee_id', type: 'uuid' },
    payload: { type: 'jsonb', default: {} },
    taskVersion: { name: 'task_version', type: Number },
    requestId: { name: 'request_id', type: String },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
  },
  indices: [{ name: 'idx_task_events_task_order', columns: ['taskId', 'createdAt', 'id'] }],
});

export const IdempotencyEntity = new EntitySchema<IdempotencyRow>({
  name: 'IdempotencyRecord',
  tableName: 'idempotency_records',
  columns: {
    key: { type: String, primary: true },
    requestFingerprint: { name: 'request_fingerprint', type: String },
    status: { type: String },
    responseStatus: { name: 'response_status', type: Number, nullable: true },
    responseBody: { name: 'response_body', type: 'jsonb', nullable: true },
    lockedUntil: { name: 'locked_until', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    completedAt: { name: 'completed_at', type: 'timestamptz', nullable: true },
    expiresAt: { name: 'expires_at', type: 'timestamptz' },
  },
});
