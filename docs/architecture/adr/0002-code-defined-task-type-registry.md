# ADR-002: Code-defined task-type registry

- Status: Accepted
- Date: 2026-08-18

## Context

The platform must support future task types without structural rewrites or repetitive type conditionals. The current workflows are known at deployment time.

## Decision

Represent each task type as an additive code-defined `TaskTypeDefinition` containing ordered statuses, labels, serializable field metadata, and complete-payload validators. Register definitions explicitly in the composition root. Generic workflow/application code resolves definitions by key and never branches on concrete type names.

## Alternatives considered

- `switch`/`if` logic in services: rejected as the coupling the assignment is designed to expose.
- Per-type services, controllers, routes, or tables: rejected because every new type would require structural changes.
- Database-authored workflow DSL: rejected as unnecessary operational and validation complexity.
- Filesystem/decorator auto-discovery: rejected because it obscures composition and adds machinery without eliminating the need to deploy code.

## Consequences

- A new type requires one definition and one registration line.
- The engine, persistence schema, routes, controllers, and existing definitions remain unchanged.
- A new generic field kind may require one validator/renderer capability, but must not introduce type-specific branching.
- Definitions are validated at startup.

