# ADR-006: Row lock plus expected-version concurrency control

- Status: Accepted
- Date: 2026-08-18

## Context

Sequential transition and closure rules can be violated when requests validate the same stale state concurrently. A row lock prevents simultaneous commits, while a client version binds the mutation to the state the user observed.

## Decision

Transition and close commands include `expectedVersion`. Inside one PostgreSQL transaction, load the task with a pessimistic write lock, compare the expected version, perform all state validation, update the task, increment version, insert the event, and complete the idempotency record.

## Alternatives considered

- TypeORM `@VersionColumn` without an explicit compare/update contract: rejected as insufficiently clear and easy to misuse.
- Row lock without expected version: prevents simultaneous writes but permits delayed commands to act on an unintended later state.
- Optimistic compare-and-swap only: valid, but the chosen lock makes multi-row task/event/idempotency orchestration easier to reason about for this implementation.
- Application mutex: rejected because it does not coordinate multiple processes.

## Consequences

- At most one mutation commits from a task version.
- Stale requests return `409 VERSION_CONFLICT`.
- Lock acquisition and resource access must follow consistent ordering to avoid deadlocks.
- Integration tests require real PostgreSQL behavior.

