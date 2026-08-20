import { errors } from './errors.js';
import type {
  AvailableCloseAction,
  AvailableTransitionAction,
  TaskTypeDefinition,
  WorkflowTaskState,
} from './types.js';

export function validateTransition(
  definition: TaskTypeDefinition,
  task: WorkflowTaskState,
  targetStatus: number,
  data: unknown,
): { payload: Record<string, unknown>; direction: 'FORWARD' | 'BACKWARD' } {
  if (task.closedAt) throw errors.taskClosed();
  const target = definition.statuses.get(targetStatus);
  if (!target) throw errors.statusNotDefined();
  if (targetStatus === task.currentStatus) throw errors.sameStatusTransition();
  if (targetStatus > task.currentStatus + 1) throw errors.forwardSkipNotAllowed();
  const direction = targetStatus > task.currentStatus ? 'FORWARD' : 'BACKWARD';
  return { payload: target.validateCompletePayload(data), direction };
}

export function validateClose(definition: TaskTypeDefinition, task: WorkflowTaskState): void {
  if (task.closedAt) throw errors.taskClosed();
  if (task.currentStatus !== definition.finalStatus) throw errors.notFinalStatus();
}

export function effectiveData(task: WorkflowTaskState): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(task.customDataByStatus).filter(
      ([status]) => Number(status) <= task.currentStatus,
    ),
  );
}

export function availableActions(
  definition: TaskTypeDefinition,
  taskId: string,
  task: WorkflowTaskState,
): { transitions: AvailableTransitionAction[]; close: AvailableCloseAction | null } {
  if (task.closedAt) return { transitions: [], close: null };
  const transitions: AvailableTransitionAction[] = [];
  const addTransition = (targetStatus: number, direction: 'FORWARD' | 'BACKWARD') => {
    const target = definition.statuses.get(targetStatus);
    if (!target) return;
    transitions.push({
      action: 'TRANSITION',
      method: 'POST',
      href: `/api/v1/tasks/${taskId}/transitions`,
      expectedVersion: task.version,
      targetStatus,
      targetLabel: target.label,
      direction,
      requiredFields: target.fields,
      currentValues: task.customDataByStatus[String(targetStatus)] ?? {},
    });
  };

  if (task.currentStatus < definition.finalStatus) addTransition(task.currentStatus + 1, 'FORWARD');
  for (let status = 1; status < task.currentStatus; status += 1) addTransition(status, 'BACKWARD');

  return {
    transitions,
    close:
      task.currentStatus === definition.finalStatus
        ? {
            action: 'CLOSE',
            method: 'POST',
            href: `/api/v1/tasks/${taskId}/close`,
            expectedVersion: task.version,
          }
        : null,
  };
}
