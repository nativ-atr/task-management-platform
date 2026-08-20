export interface User {
  id: string;
  displayName: string;
}

export type FieldDefinition =
  | { kind: 'TEXT'; name: string; label: string; required: true; minLength: number }
  | {
      kind: 'FIXED_STRING_ARRAY';
      name: string;
      label: string;
      required: true;
      exactItems: number;
      itemMinLength: number;
    };

export interface TaskTypeDefinition {
  key: string;
  label: string;
  initialStatus: 1;
  finalStatus: number;
  statuses: Array<{ status: number; label: string; fields: FieldDefinition[] }>;
}

export interface AvailableTransition {
  action: 'TRANSITION';
  method: 'POST';
  href: string;
  expectedVersion: number;
  targetStatus: number;
  targetLabel: string;
  direction: 'FORWARD' | 'BACKWARD';
  requiredFields: FieldDefinition[];
  currentValues: Record<string, unknown>;
}

export interface Task {
  id: string;
  type: string;
  typeLabel: string;
  currentStatus: number;
  currentStatusLabel: string;
  state: 'OPEN' | 'CLOSED';
  assignedUser: User;
  effectiveData: Record<string, Record<string, unknown>>;
  version: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  availableActions: {
    transitions: AvailableTransition[];
    close: { action: 'CLOSE'; method: 'POST'; href: string; expectedVersion: number } | null;
  };
}

export interface TaskPage {
  items: Task[];
  nextCursor: string | null;
  totalCount: number;
}

export interface TaskEvent {
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
  occurredAt: string;
}

export interface ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  requestId?: string;
}
