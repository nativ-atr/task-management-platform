# ADR-014: PostgreSQL, TypeORM, real migrations, deterministic seeds

- Status: Accepted
- Date: 2026-08-18

## Context

The assignment mandates TypeORM with SQL and database migrations/demo users. The design uses JSONB, transactional row locks, concurrency tests, and cursor-indexed reads.

## Decision

Use PostgreSQL through TypeORM. Define schema exclusively through committed migrations and seed deterministic demo users through an idempotent seed command or migration-safe seed routine. Set `synchronize: false` in every environment.

## Alternatives considered

- SQLite: compliant with the assignment but lacks the selected row-lock behavior and provides weaker production-concurrency evidence.
- MySQL/MariaDB: viable, but PostgreSQL JSONB and lock behavior align directly with the chosen model.
- TypeORM schema synchronization: rejected because it is unsafe and violates the migrations deliverable.

## Consequences

- Local development and integration tests require PostgreSQL, supplied through Compose/Testcontainers.
- Migrations are verified both forward and against a clean database.
- PostgreSQL-specific JSONB and lock behavior are deliberate portability trade-offs.

