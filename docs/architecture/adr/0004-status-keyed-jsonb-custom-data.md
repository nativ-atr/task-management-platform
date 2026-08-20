# ADR-004: Status-keyed JSONB for last-submitted data

- Status: Accepted
- Date: 2026-08-18

## Context

Task types have different status-specific fields. The current effective data must be inexpensive to read, while backward movement must not erase history needed for prefill and audit.

## Decision

Store a JSONB object on `tasks`, keyed by decimal status string. Each value is the last complete payload submitted when entering that status. On entry, replace the target status value rather than partially merging it. Retain values for higher statuses after a backward move.

Public task responses expose `effectiveData` only for status keys less than or equal to `currentStatus`. Higher-status retained values are historical and may appear only through audit history or as transition `currentValues` for prefill.

## Alternatives considered

- Type-specific columns/tables: rejected because a new type would require schema changes.
- EAV: rejected because it adds joins, weak typing, complex validation, and poor developer ergonomics for small structured payloads.
- Transition log as the only source of state: rejected because current-state reconstruction and repeated visits require projections/replay.
- One unkeyed current payload: rejected because prerequisite and prefill data across statuses would be lost.

## Consequences

- Current read mapping is simple and task-type-agnostic.
- JSON shape is enforced at the application layer, not by per-type database columns.
- Audit events remain the chronological source of truth.
- Definition/schema evolution requires a future versioning strategy if workflows change after persisted tasks exist.

