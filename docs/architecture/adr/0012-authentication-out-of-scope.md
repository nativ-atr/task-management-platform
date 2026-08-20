# ADR-012: Authentication and user management excluded

- Status: Accepted
- Date: 2026-08-18

## Context

The assignment explicitly says users need not be managed and permits a hard-coded user ID. Implementing an identity system would expand business scope and obscure the workflow architecture being evaluated.

## Decision

Do not implement login, tokens, sessions, roles, invitations, or user CRUD. Seed deterministic users and allow selection through the read-only users endpoint. Design controllers/use cases so an authenticated principal and authorization policy can be added later without changing domain workflow rules.

## Alternatives considered

- JWT/RBAC implementation: rejected as unrelated scope.
- No user table: rejected because tasks must reference one existing assignee and the assignment requires seeded users.

## Consequences

- The implementation is production-quality within the assignment boundary but not safe for untrusted public deployment without an upstream identity/authorization layer.
- Caller identity is not audited; request ID and assignment changes are audited.
- This limitation must remain explicit in README and API documentation.

