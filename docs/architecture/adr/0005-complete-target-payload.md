# ADR-005: Complete target payload on every transition

- Status: Accepted
- Date: 2026-08-18

## Context

The assignment says every status change must satisfy type-specific data requirements. It does not define whether backward movement or re-entry may silently reuse older data.

## Decision

Every forward and backward transition submits the complete payload required by its target status. Unknown properties are rejected. The validated payload replaces the target status's last-submitted value. Historical values may prefill a client form but are never silently reused by the server.

## Alternatives considered

- Validate only forward movement: rejected because it conflicts with the literal every-change rule.
- Merge partial payloads: rejected because effective results would depend on hidden history and omission semantics.
- Automatically reuse stored target data: rejected because stale or previously incorrect data could satisfy a later transition without deliberate confirmation.
- Clear all higher-status data on backward movement: rejected because it destroys useful prefill state and conflates current effectiveness with history retention.

## Consequences

- Every event contains a meaningful complete snapshot of the target-status submission.
- Re-entry semantics are deterministic.
- Backward forms may require data, but the client can prefill the last stored values.
- Status 1 requires an explicit empty object.

