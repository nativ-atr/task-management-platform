# ADR-001: Express with explicit layered architecture

- Status: Accepted
- Date: 2026-08-18

## Context

The backend must use Node.js with Express, Fastify, or NestJS. The implementer is most familiar with Express. The assignment primarily evaluates clean separation of generic and task-specific rules, not framework-specific conventions.

## Decision

Use Express with strict TypeScript and explicit domain, application, infrastructure, HTTP, and composition-root boundaries. Controllers are thin; application use cases own orchestration; the domain is framework-independent; TypeORM is isolated in infrastructure.

## Alternatives considered

- NestJS: strong conventions and DI, but unnecessary framework friction and no automatic multi-provider registry behavior.
- Fastify: valid, but offers no relevant advantage for this domain and is less familiar.
- Unlayered Express handlers: rejected because workflow, persistence, and transport concerns would become coupled.

## Consequences

- Familiarity reduces accidental framework misuse.
- Architectural rules must be enforced through repository structure, tests, and review rather than Nest modules.
- Dependency assembly is explicit in `composition-root.ts`.
- Adding a container library requires a new ADR and demonstrated need.

