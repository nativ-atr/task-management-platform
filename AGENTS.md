# Codex implementation instructions

This repository specifies an extensible task-management platform. Implement the application from the repository documents; do not rely on the conversation that produced them.

## Read order and sources of truth

Read these files before changing code:

1. `docs/SPEC.md` — functional behavior, domain invariants, edge cases, acceptance criteria, and scope.
2. `docs/api/openapi.yaml` — public HTTP contract. Implement it exactly.
3. `docs/architecture/architecture.md` — module boundaries, persistence, transactions, validation, client design, and tests.
4. `docs/architecture/adr/` — binding architectural decisions and their rationale.

Precedence for conflicts:

1. Domain invariants in `docs/SPEC.md`.
2. External request/response shapes in `docs/api/openapi.yaml`.
3. Architecture boundaries in `docs/architecture/architecture.md`.
4. ADR rationale.

Do not silently resolve a conflict. Make the smallest coherent documentation correction, explain it, and keep all affected files aligned. Genuine unresolved product ambiguities are listed in `docs/SPEC.md`; there are none at package creation time.

## Required technology and structure

- Backend: Node.js, strict TypeScript, Express, TypeORM, PostgreSQL.
- Client: React, strict TypeScript, Vite, TanStack Query, React Hook Form.
- Validation: Zod at HTTP and domain boundaries; task-type field metadata must remain serializable for the client.
- Tests: unit tests, PostgreSQL integration tests, HTTP tests, concurrency/idempotency tests, React component tests, and Playwright lifecycle tests.
- Use a simple workspace structure such as `server/`, `client/`, and an optional generated/shared API-contract package. Do not introduce Nx, Turbo, microservices, CQRS, event sourcing, Kafka, or a database-authored workflow DSL.

## Non-negotiable engineering constraints

- Keep the workflow engine pure and independent of Express, TypeORM, and React.
- Keep task-specific rules inside additive task-type definitions. No `if`, `switch`, controller, route, repository, or UI branch may depend on `procurement` or `development` outside their definitions, fixtures, and tests.
- A new task type may require one definition and one composition-root registration, but no workflow-engine, persistence-schema, controller, route, or existing-definition change.
- `Closed` is orthogonal to numeric status. A closed task remains at its final integer status.
- Every status transition submits a complete payload for the target status and a next assignee. Never partially merge target-status data.
- Backward transitions may target any lower defined status. Forward transitions must move exactly one status.
- Closing is not a status transition: it accepts no task payload or next assignee, retains the current assignee, and is allowed only at the final status.
- Closed tasks are immutable and cannot be reopened.
- Mutations use an idempotency key, expected task version where applicable, a short idempotency-reservation transaction, then one atomic business transaction with a pessimistic task-row lock where applicable.
- Task state, idempotency outcome, and audit event must commit atomically.
- Server-computed `availableActions` is an affordance only; every mutation must revalidate the authoritative rules.
- Persist task-type data in status-keyed JSONB and expose only effective data as current state. Retained data for statuses above the current status is historical.
- Do not implement in-place editing of status data.
- Do not implement authentication or user management. Preserve the boundary so authentication/authorization can be added later.
- Use real migrations and deterministic demo-user seeds. Never use TypeORM `synchronize: true`.

## API and operational requirements

- Serve the API under `/api/v1` and conform to `docs/api/openapi.yaml`.
- Generate or validate OpenAPI from a single controlled contract; prevent implementation/contract drift in CI.
- Use the documented error envelope and stable machine-readable codes.
- Add structured JSON logs, request IDs, environment validation, graceful shutdown, security headers, configured CORS, request-size limits, liveness, and readiness endpoints.
- Never log task custom payloads, idempotency keys, or secrets at normal log levels.
- Use cursor pagination where specified.

## Required verification

Provide repository scripts with these capabilities (names may differ only if documented):

- install from a clean checkout;
- lint and formatting check;
- strict type-check for server and client;
- OpenAPI lint/validation;
- unit tests;
- PostgreSQL integration and HTTP tests;
- concurrency and idempotency tests;
- React component tests;
- Playwright end-to-end tests;
- production builds;
- migrations and deterministic seeds against a clean database.

Before declaring the implementation complete:

1. Start from a clean database.
2. Apply migrations and seeds.
3. Run every verification command.
4. Exercise both task types through create, forward, backward, re-entry, final status, and close.
5. Verify stale-version rejection, immediate and delayed duplicate handling, idempotency-key reuse with a different request, close/transition races, and closed-task immutability.
6. Register a third test-only task type and prove it uses the same engine, API use case, persistence model, and generic client field vocabulary.
7. Confirm README instructions work from a fresh checkout.
