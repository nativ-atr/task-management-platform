# ADR-013: No in-place status-data amendment operation

- Status: Accepted
- Date: 2026-08-18

## Context

The assignment defines create, change status, close, and get-user-tasks operations. It defines data requirements at status-change boundaries but no same-status edit operation.

## Decision

Do not expose an endpoint that changes task-specific data without changing status. Data is mutable only when entering a status. Correcting current-status data requires leaving and re-entering that status.

## Alternatives considered

- `PATCH /tasks/{id}/data`: rejected because its validation, authorization, audit, and version semantics are not specified and it expands scope.
- Same-status transition as edit: rejected because same-status transitions are explicitly invalid.

## Consequences

- Mutation semantics remain small and unambiguous.
- The limitation is documented rather than disguised.
- A future amendment operation would require its own domain rules, event type, authorization, concurrency, and ADR.

