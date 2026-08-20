# ADR-009: Server-driven available actions and form metadata

- Status: Accepted
- Date: 2026-08-18

## Context

The React client must remain generic and avoid duplicating task-type logic. It also needs target fields and previous values to render and prefill transition forms.

## Decision

Return server-computed `availableActions` with every task read model. Include every lower backward target, at most one next forward target, serializable required-field metadata, and last stored `currentValues` for each target. Include a close action only when the open task is at its final status. Closed tasks have no actions.

Also expose `GET /task-types` for creation and type discovery. Available actions are affordances; mutations re-run all authoritative validations.

## Alternatives considered

- Type-specific React conditionals: rejected because adding a type would require client rewrites.
- Client recomputation from raw definitions only: possible, but duplicates generic transition predicates and makes server/client drift more likely.
- `availableActions` without task-type discovery: rejected because it cannot drive creation.
- A fully generic JSON Schema form engine: rejected as broader than the small controlled field vocabulary requires.

## Consequences

- A new type using existing field kinds renders without type-specific client changes.
- The API read model is richer and must be contract-tested.
- New generic field kinds require one generic server metadata/validation capability and one generic client renderer.

