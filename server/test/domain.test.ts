import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  complianceDefinition,
  fixedStringArrayField,
  procurementDefinition,
  textField,
} from '../src/domain/definitions.js';
import { AppError } from '../src/domain/errors.js';
import { TaskTypeRegistry } from '../src/domain/registry.js';
import {
  availableActions,
  effectiveData,
  validateClose,
  validateTransition,
} from '../src/domain/workflow.js';
import type {
  StatusDefinition,
  TaskTypeDefinition,
  WorkflowTaskState,
} from '../src/domain/types.js';

const openTask = (overrides: Partial<WorkflowTaskState> = {}): WorkflowTaskState => ({
  type: 'procurement',
  currentStatus: 1,
  closedAt: null,
  version: 1,
  customDataByStatus: {},
  ...overrides,
});

describe('workflow domain', () => {
  it('registers Compliance as an additive task type with serializable metadata', () => {
    const registry = new TaskTypeRegistry([procurementDefinition, complianceDefinition]);
    expect(registry.require('compliance')).toBe(complianceDefinition);
    expect([...complianceDefinition.statuses.values()].map((status) => status.label)).toEqual([
      'Created',
      'Intake completed',
      'Documents verified',
      'Compliance review completed',
      'Approval completed',
    ]);
    expect(complianceDefinition.statuses.get(3)?.fields).toEqual([
      {
        kind: 'TEXT',
        name: 'documentNotes',
        label: 'Document notes',
        required: true,
        minLength: 1,
      },
    ]);
  });

  it('allows sequential forward transitions with complete normalized payloads', () => {
    const decision = validateTransition(procurementDefinition, openTask(), 2, {
      quotes: ['  one ', 'two'],
    });
    expect(decision.direction).toBe('FORWARD');
    expect(decision.payload).toEqual({ quotes: ['one', 'two'] });
  });

  it('rejects same-status and skipped-forward transitions', () => {
    expect(() => validateTransition(procurementDefinition, openTask(), 1, {})).toThrow(AppError);
    expect(() =>
      validateTransition(procurementDefinition, openTask(), 3, { receipt: 'x' }),
    ).toThrow(/Forward transitions/);
  });

  it('allows every lower status as a backward target and requires target payload', () => {
    const task = openTask({ currentStatus: 3 });
    expect(validateTransition(procurementDefinition, task, 1, {}).direction).toBe('BACKWARD');
    expect(() => validateTransition(procurementDefinition, task, 2, {})).toThrow(/target payload/);
  });

  it('keeps closed state orthogonal and immutable', () => {
    const task = openTask({ currentStatus: 3, closedAt: new Date() });
    expect(() =>
      validateTransition(procurementDefinition, task, 2, { quotes: ['a', 'b'] }),
    ).toThrow(/Closed tasks/);
  });

  it('allows close only at final status', () => {
    expect(() => validateClose(procurementDefinition, openTask({ currentStatus: 2 }))).toThrow(
      /final/,
    );
    expect(() =>
      validateClose(procurementDefinition, openTask({ currentStatus: 3 })),
    ).not.toThrow();
  });

  it('computes effective data and retained prefill values separately', () => {
    const task = openTask({
      currentStatus: 2,
      customDataByStatus: {
        '2': { quotes: ['a', 'b'] },
        '3': { receipt: 'old' },
      },
    });
    expect(effectiveData(task)).toEqual({ '2': { quotes: ['a', 'b'] } });
    expect(availableActions(procurementDefinition, 'task-id', task).transitions).toContainEqual(
      expect.objectContaining({ targetStatus: 3, currentValues: { receipt: 'old' } }),
    );
  });

  it('runs Compliance through existing workflow rules and payload validators', () => {
    const task = openTask({ type: 'compliance', currentStatus: 2 });
    const documents = validateTransition(complianceDefinition, task, 3, {
      documentNotes: '  documents look complete ',
    });
    expect(documents).toEqual({
      direction: 'FORWARD',
      payload: { documentNotes: 'documents look complete' },
    });
    expect(() => validateTransition(complianceDefinition, task, 3, { documentNotes: '' })).toThrow(
      /target payload/,
    );
    expect(() =>
      validateTransition(complianceDefinition, task, 3, {
        documentNotes: 'documents look complete',
        extra: true,
      }),
    ).toThrow(/target payload/);
    expect(() =>
      validateTransition(complianceDefinition, openTask({ type: 'compliance' }), 3, {
        documentNotes: 'documents look complete',
      }),
    ).toThrow(/Forward transitions/);
    expect(() =>
      validateTransition(complianceDefinition, openTask({ type: 'compliance' }), 1, {}),
    ).toThrow(AppError);
    expect(() =>
      validateClose(complianceDefinition, openTask({ type: 'compliance', currentStatus: 4 })),
    ).toThrow(/final/);
  });

  it('computes Compliance actions and close affordance without type-specific rules', () => {
    const task = openTask({
      type: 'compliance',
      currentStatus: 5,
      version: 5,
      customDataByStatus: {
        '2': { caseReference: 'CASE-1' },
        '3': { documentNotes: 'Documents complete' },
        '4': { reviewNotes: 'Reviewed' },
        '5': { approvalReference: 'APP-1' },
      },
    });
    expect(validateClose(complianceDefinition, task)).toBeUndefined();
    expect(availableActions(complianceDefinition, 'task-id', task)).toEqual({
      transitions: expect.arrayContaining([
        expect.objectContaining({
          targetStatus: 3,
          targetLabel: 'Documents verified',
          direction: 'BACKWARD',
          currentValues: { documentNotes: 'Documents complete' },
        }),
      ]),
      close: expect.objectContaining({ action: 'CLOSE', expectedVersion: 5 }),
    });
  });

  it('fails startup for invalid definitions and accepts a third type', () => {
    const status1: StatusDefinition = {
      status: 1,
      label: 'Created',
      fields: [],
      validateCompletePayload: (input) => z.object({}).strict().parse(input),
    };
    const status2: StatusDefinition = {
      status: 2,
      label: 'Reviewed',
      fields: [textField('note', 'Note'), fixedStringArrayField('approvers', 'Approvers', 2)],
      validateCompletePayload: (input) =>
        z
          .object({
            note: z.string().trim().min(1),
            approvers: z.array(z.string().trim().min(1)).length(2),
          })
          .strict()
          .parse(input),
    };
    const third: TaskTypeDefinition = {
      key: 'qa-review',
      label: 'QA Review',
      initialStatus: 1,
      finalStatus: 2,
      statuses: new Map([
        [1, status1],
        [2, status2],
      ]),
    };
    expect(() => new TaskTypeRegistry([procurementDefinition, complianceDefinition])).not.toThrow();
    expect(
      () =>
        new TaskTypeRegistry([
          {
            ...third,
            statuses: new Map([[2, status2]]),
          },
        ]),
    ).toThrow(/contiguous/);
  });
});
