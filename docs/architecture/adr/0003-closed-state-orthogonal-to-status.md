# ADR-003: Closed state is orthogonal to integer status

- Status: Accepted
- Date: 2026-08-18

## Context

The domain separately states that status is an ascending integer and that a task may close only at its final status. Modelling `Closed` as another status would assign different close numbers to different types and complicate generic rules.

## Decision

Persist `closedAt` independently from `currentStatus`. A closed task remains at the type's final integer status. Closing is a distinct mutation, not a status transition.

## Alternatives considered

- Boolean `isClosed`: workable, but `closedAt` captures state and useful audit timing without two columns.
- `Closed` as a numeric or string status: rejected because it violates the orthogonal rules and creates type-specific special cases.

## Consequences

- Close accepts no transition payload or next assignee.
- Current assignee and final status persist after closure.
- Closing increments version and writes a `TASK_CLOSED` event.
- Closed tasks expose no actions and reject all mutations; reopening is unsupported.

