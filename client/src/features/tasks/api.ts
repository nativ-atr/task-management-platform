import type { ApiError, Task, TaskEvent, TaskPage, TaskTypeDefinition, User } from './types.js';

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
        requestId?: string;
      };
    };
    const error = new Error(body.error?.message ?? 'Request failed') as ApiError;
    error.status = response.status;
    error.code = body.error?.code ?? 'REQUEST_FAILED';
    error.details = body.error?.details ?? {};
    if (body.error?.requestId) error.requestId = body.error.requestId;
    throw error;
  }
  return (await response.json()) as T;
}

export const api = {
  taskTypes: () => request<{ items: TaskTypeDefinition[] }>('/api/v1/task-types'),
  users: () => request<{ items: User[] }>('/api/v1/users'),
  task: (taskId: string) => request<Task>(`/api/v1/tasks/${taskId}`),
  tasks: (filters: {
    assignedUserId: string | undefined;
    state: 'ALL' | 'OPEN' | 'CLOSED';
    limit: number;
    cursor: string | undefined;
  }) => {
    const params = new URLSearchParams({ state: filters.state, limit: String(filters.limit) });
    if (filters.assignedUserId) params.set('assignedUserId', filters.assignedUserId);
    if (filters.cursor) params.set('cursor', filters.cursor);
    return request<TaskPage>(`/api/v1/tasks?${params.toString()}`);
  },
  taskEvents: (taskId: string) =>
    request<{ items: TaskEvent[]; nextCursor: string | null }>(`/api/v1/tasks/${taskId}/events`),
  createTask: (body: { type: string; assignedUserId: string }, idempotencyKey: string) =>
    request<Task>('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    }),
  transitionTask: (
    taskId: string,
    body: {
      targetStatus: number;
      nextAssignedUserId: string;
      expectedVersion: number;
      data: Record<string, unknown>;
    },
    idempotencyKey: string,
  ) =>
    request<Task>(`/api/v1/tasks/${taskId}/transitions`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    }),
  closeTask: (taskId: string, expectedVersion: number, idempotencyKey: string) =>
    request<Task>(`/api/v1/tasks/${taskId}/close`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ expectedVersion }),
    }),
};
