import { AppError } from './errors.js';
import type { FieldDefinition, TaskTypeDefinition } from './types.js';

const typeKeyPattern = /^[a-z][a-z0-9-]*$/;
const fieldNamePattern = /^[A-Za-z][A-Za-z0-9]*$/;

export class TaskTypeRegistry {
  private readonly byKey: Map<string, TaskTypeDefinition>;

  constructor(definitions: readonly TaskTypeDefinition[]) {
    validateDefinitions(definitions);
    this.byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  }

  get(key: string): TaskTypeDefinition | undefined {
    return this.byKey.get(key);
  }

  require(key: string): TaskTypeDefinition {
    const definition = this.get(key);
    if (!definition) throw new AppError('TASK_TYPE_NOT_FOUND', 'Task type not found.', 422);
    return definition;
  }

  list(): TaskTypeDefinition[] {
    return [...this.byKey.values()];
  }
}

export function validateDefinitions(definitions: readonly TaskTypeDefinition[]): void {
  const seenTypeKeys = new Set<string>();

  for (const definition of definitions) {
    if (!typeKeyPattern.test(definition.key)) {
      throw new Error(`Invalid task type key ${definition.key}`);
    }
    if (seenTypeKeys.has(definition.key))
      throw new Error(`Duplicate task type key ${definition.key}`);
    seenTypeKeys.add(definition.key);
    if (definition.initialStatus !== 1)
      throw new Error(`${definition.key} initial status must be 1`);

    const statuses = [...definition.statuses.values()];
    if (statuses.length === 0) throw new Error(`${definition.key} must define statuses`);
    for (let i = 0; i < statuses.length; i += 1) {
      const expected = i + 1;
      const entry = statuses[i];
      if (!entry || entry.status !== expected) {
        throw new Error(`${definition.key} statuses must be contiguous and ordered`);
      }
      validateFields(definition.key, entry.fields);
    }
    if (definition.finalStatus !== statuses.length) {
      throw new Error(`${definition.key} final status must be the highest status`);
    }
    if ((statuses[0]?.fields.length ?? 1) !== 0) {
      throw new Error(`${definition.key} status 1 must not require custom data`);
    }
    assertValidatorMatchesMetadata(definition);
  }
}

function validateFields(typeKey: string, fields: readonly FieldDefinition[]): void {
  const names = new Set<string>();
  for (const field of fields) {
    if (!fieldNamePattern.test(field.name)) throw new Error(`${typeKey} has invalid field name`);
    if (names.has(field.name)) throw new Error(`${typeKey} has duplicate field name ${field.name}`);
    names.add(field.name);
    if (field.kind === 'TEXT' && field.minLength < 1)
      throw new Error(`${typeKey} invalid text field`);
    if (field.kind === 'FIXED_STRING_ARRAY' && (field.exactItems < 1 || field.itemMinLength < 1)) {
      throw new Error(`${typeKey} invalid fixed array field`);
    }
  }
}

function assertValidatorMatchesMetadata(definition: TaskTypeDefinition): void {
  for (const status of definition.statuses.values()) {
    const validPayload = Object.fromEntries(
      status.fields.map((field) => {
        if (field.kind === 'TEXT') return [field.name, 'x'.repeat(field.minLength)];
        return [
          field.name,
          Array.from({ length: field.exactItems }, () => 'x'.repeat(field.itemMinLength)),
        ];
      }),
    );
    status.validateCompletePayload(validPayload);
    try {
      status.validateCompletePayload({ ...validPayload, unexpected: true });
      throw new Error(`${definition.key} status ${status.status} validator accepts unknown fields`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('validator accepts unknown fields'))
        throw error;
    }
  }
}
