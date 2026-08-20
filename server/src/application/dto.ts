import type {
  AvailableCloseAction,
  AvailableTransitionAction,
  FieldDefinition,
} from '../domain/types.js';
import type { TaskEventRow, UserRow } from '../infrastructure/entities.js';

export interface UserDto {
  id: string;
  displayName: string;
}

export interface TaskTypeDto {
  key: string;
  label: string;
  initialStatus: 1;
  finalStatus: number;
  statuses: Array<{
    status: number;
    label: string;
    fields: readonly FieldDefinition[];
  }>;
}

export interface TaskDto {
  id: string;
  type: string;
  typeLabel: string;
  currentStatus: number;
  currentStatusLabel: string;
  state: 'OPEN' | 'CLOSED';
  assignedUser: UserDto;
  effectiveData: Record<string, Record<string, unknown>>;
  version: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  availableActions: {
    transitions: AvailableTransitionAction[];
    close: AvailableCloseAction | null;
  };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TaskPageDto extends Page<TaskDto> {
  totalCount: number;
}

export interface TaskEventDto {
  id: string;
  taskId: string;
  eventType: TaskEventRow['eventType'];
  fromStatus: number | null;
  toStatus: number;
  fromAssignedUserId: string | null;
  toAssignedUserId: string;
  payload: Record<string, unknown>;
  taskVersion: number;
  requestId: string;
  occurredAt: string;
}

export function toUserDto(user: UserRow): UserDto {
  return { id: user.id, displayName: user.displayName };
}
