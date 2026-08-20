import { z } from 'zod';
import { errors } from './errors.js';
import type { FieldDefinition, StatusDefinition, TaskTypeDefinition } from './types.js';

const emptyPayload = z.object({}).strict();
const nonEmptyTrimmed = z.string().trim().min(1);

function status(
  value: number,
  label: string,
  fields: readonly FieldDefinition[],
  schema: z.ZodType<Record<string, unknown>>,
): StatusDefinition {
  return {
    status: value,
    label,
    fields,
    validateCompletePayload(input: unknown) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        throw errors.payloadValidationFailed({ issues: parsed.error.issues });
      }
      return parsed.data;
    },
  };
}

function asMap(statuses: readonly StatusDefinition[]): ReadonlyMap<number, StatusDefinition> {
  return new Map(statuses.map((entry) => [entry.status, entry]));
}

export function textField(name: string, label: string, minLength = 1): FieldDefinition {
  return { kind: 'TEXT', name, label, required: true, minLength };
}

export function fixedStringArrayField(
  name: string,
  label: string,
  exactItems: number,
  itemMinLength = 1,
): FieldDefinition {
  return { kind: 'FIXED_STRING_ARRAY', name, label, required: true, exactItems, itemMinLength };
}

export const procurementDefinition: TaskTypeDefinition = {
  key: 'procurement',
  label: 'Procurement',
  initialStatus: 1,
  finalStatus: 3,
  statuses: asMap([
    status(1, 'Created', [], emptyPayload),
    status(
      2,
      'Supplier offers received',
      [fixedStringArrayField('quotes', 'Quotes', 2)],
      z.object({ quotes: z.array(nonEmptyTrimmed).length(2) }).strict(),
    ),
    status(
      3,
      'Purchase completed',
      [textField('receipt', 'Receipt')],
      z.object({ receipt: nonEmptyTrimmed }).strict(),
    ),
  ]),
};

export const developmentDefinition: TaskTypeDefinition = {
  key: 'development',
  label: 'Development',
  initialStatus: 1,
  finalStatus: 4,
  statuses: asMap([
    status(1, 'Created', [], emptyPayload),
    status(
      2,
      'Specification completed',
      [textField('specification', 'Specification')],
      z.object({ specification: nonEmptyTrimmed }).strict(),
    ),
    status(
      3,
      'Development completed',
      [textField('branchName', 'Branch name')],
      z.object({ branchName: nonEmptyTrimmed }).strict(),
    ),
    status(
      4,
      'Distribution completed',
      [textField('version', 'Version')],
      z.object({ version: nonEmptyTrimmed }).strict(),
    ),
  ]),
};

export const complianceDefinition: TaskTypeDefinition = {
  key: 'compliance',
  label: 'Compliance',
  initialStatus: 1,
  finalStatus: 5,
  statuses: asMap([
    status(1, 'Created', [], emptyPayload),
    status(
      2,
      'Intake completed',
      [textField('caseReference', 'Case reference')],
      z.object({ caseReference: nonEmptyTrimmed }).strict(),
    ),
    status(
      3,
      'Documents verified',
      [textField('documentNotes', 'Document notes')],
      z.object({ documentNotes: nonEmptyTrimmed }).strict(),
    ),
    status(
      4,
      'Compliance review completed',
      [textField('reviewNotes', 'Review notes')],
      z.object({ reviewNotes: nonEmptyTrimmed }).strict(),
    ),
    status(
      5,
      'Approval completed',
      [textField('approvalReference', 'Approval reference')],
      z.object({ approvalReference: nonEmptyTrimmed }).strict(),
    ),
  ]),
};
