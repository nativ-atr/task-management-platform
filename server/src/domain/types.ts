export type FieldDefinition =
  | {
      kind: 'TEXT';
      name: string;
      label: string;
      required: true;
      minLength: number;
    }
  | {
      kind: 'FIXED_STRING_ARRAY';
      name: string;
      label: string;
      required: true;
      exactItems: number;
      itemMinLength: number;
    };

export interface StatusDefinition {
  status: number;
  label: string;
  fields: readonly FieldDefinition[];
  validateCompletePayload(input: unknown): Record<string, unknown>;
}

export interface TaskTypeDefinition {
  key: string;
  label: string;
  initialStatus: 1;
  finalStatus: number;
  statuses: ReadonlyMap<number, StatusDefinition>;
}

export interface WorkflowTaskState {
  type: string;
  currentStatus: number;
  closedAt: Date | null;
  version: number;
  customDataByStatus: Record<string, Record<string, unknown>>;
}

export interface AvailableTransitionAction {
  action: 'TRANSITION';
  method: 'POST';
  href: string;
  expectedVersion: number;
  targetStatus: number;
  targetLabel: string;
  direction: 'FORWARD' | 'BACKWARD';
  requiredFields: readonly FieldDefinition[];
  currentValues: Record<string, unknown>;
}

export interface AvailableCloseAction {
  action: 'CLOSE';
  method: 'POST';
  href: string;
  expectedVersion: number;
}
