# ADR-010: Co-located validation metadata and startup integrity checks

- Status: Accepted
- Date: 2026-08-18

## Context

Backend validation and frontend field rendering must describe the same target payload. Serializing arbitrary Zod schemas directly is not a sufficient UI contract, and maintaining unrelated schemas invites drift.

## Decision

Each status definition co-locates a small serializable field vocabulary with its complete-payload validator. Use Zod at HTTP/domain boundaries. At startup, validate definition keys, contiguous statuses, initial/final rules, field uniqueness, supported kinds, and metadata/validator consistency. Fail startup loudly on invalid definitions.

## Alternatives considered

- Zod schema only: rejected because client labels, fixed array cardinality, and rendering metadata need an intentional public contract.
- JSON Schema/Ajv as the entire workflow definition: valid but heavier than the controlled code-defined field vocabulary.
- Independent backend schema and frontend form configuration: rejected because they can drift.

## Consequences

- The supported field vocabulary is intentionally small and testable.
- Definition authors receive immediate startup feedback.
- Unknown payload properties and incomplete payloads are rejected consistently.

