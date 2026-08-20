# Architecture Decision Records

ADRs are binding unless superseded. Each record states context, decision, alternatives, and consequences.

| ADR | Decision |
|---|---|
| [ADR-001](0001-express-layered-architecture.md) | Express with explicit layered architecture |
| [ADR-002](0002-code-defined-task-type-registry.md) | Code-defined task-type registry |
| [ADR-003](0003-closed-state-orthogonal-to-status.md) | Closed state is orthogonal to integer status |
| [ADR-004](0004-status-keyed-jsonb-custom-data.md) | Status-keyed JSONB for last-submitted data |
| [ADR-005](0005-complete-target-payload.md) | Complete target payload on every transition |
| [ADR-006](0006-concurrency-control.md) | Row lock plus expected-version concurrency control |
| [ADR-007](0007-idempotent-mutations.md) | Idempotency keys for all mutation endpoints |
| [ADR-008](0008-append-only-task-events.md) | Append-only generalized task-event audit log |
| [ADR-009](0009-server-driven-actions.md) | Server-driven available actions and form metadata |
| [ADR-010](0010-validation-and-definition-integrity.md) | Co-located validation metadata and startup integrity checks |
| [ADR-011](0011-api-versioning-and-errors.md) | Versioned REST API with stable error envelope |
| [ADR-012](0012-authentication-out-of-scope.md) | Authentication and user management excluded |
| [ADR-013](0013-no-in-place-status-data-edit.md) | No in-place status-data amendment operation |
| [ADR-014](0014-postgresql-typeorm-migrations.md) | PostgreSQL, TypeORM, real migrations, deterministic seeds |
| [ADR-015](0015-production-verification.md) | Production-quality verification and delivery gates |
| [ADR-016](0016-container-runtime-topology.md) | Container runtime topology |
