# ADR-008: Append-only generalized task-event audit log

- Status: Accepted
- Date: 2026-08-18

## Context

Production-quality auditability should include creation and closing as well as numeric transitions. A transition-only table would omit important lifecycle changes.

## Decision

Write immutable `TASK_CREATED`, `STATUS_CHANGED`, and `TASK_CLOSED` rows to `task_events`. Each event records from/to status, from/to assignee, complete submitted transition payload when applicable, resulting task version, request ID, and timestamp. Insert the event in the same transaction as task state and idempotency completion.

## Alternatives considered

- No history: rejected because it weakens auditability and verification.
- `task_transitions` only: rejected because create and close are not status transitions.
- Event sourcing: rejected because the task row remains the authoritative current read model; replay/projection machinery is unnecessary.
- Full task snapshot on every event: rejected as redundant for current requirements. The event is self-contained for the action, not a complete task snapshot.

## Consequences

- Event history explains every lifecycle change without replaying diffs for target payloads.
- Events are never updated or deleted by application code.
- The task row and event log must be transactionally consistent.
- Audit retention policy beyond non-deletion is an operational future decision.

