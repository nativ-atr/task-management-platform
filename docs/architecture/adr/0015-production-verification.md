# ADR-015: Production-quality verification and delivery gates

- Status: Accepted
- Date: 2026-08-18

## Context

The implementation is not constrained to an eight-hour MVP. Production quality requires proof of correctness beyond a happy-path demo while still respecting the assignment's product scope.

## Decision

Require strict type-checking, formatting/linting, OpenAPI validation, domain unit tests, real-PostgreSQL integration and HTTP tests, concurrency/idempotency tests, React component tests, Playwright lifecycle tests, clean migration/seed verification, production builds, structured logging, health endpoints, graceful shutdown, and reproducible Docker development/deployment artifacts.

## Alternatives considered

- Unit tests only: rejected because locking, transactionality, persistence, and HTTP contracts require integration evidence.
- Manual verification only: rejected because the domain matrix and retry behavior are regression-prone.
- Broad infrastructure such as Kubernetes or message brokers: rejected because production quality does not justify unrelated product/infrastructure scope.

## Consequences

- CI is a delivery gate rather than an optional signal.
- Real PostgreSQL is required in tests.
- README commands must work from a clean checkout.
- The test suite must prove third-type extensibility and closed-task immutability.

