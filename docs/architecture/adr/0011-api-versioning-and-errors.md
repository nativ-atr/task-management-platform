# ADR-011: Versioned REST API with stable error envelope

- Status: Accepted
- Date: 2026-08-18

## Context

The client and automated tests need a precise public contract and stable machine-readable failures. The domain includes state conflicts distinct from malformed input and task-specific validation.

## Decision

Serve REST endpoints beneath `/api/v1` and maintain `docs/api/openapi.yaml` as the public contract. Use one error envelope containing code, safe message, optional details, and request ID. Apply the status policy in `docs/SPEC.md` consistently.

## Alternatives considered

- Unversioned routes: rejected because a production-facing contract should permit later incompatible evolution.
- Controller-specific error shapes: rejected because clients would need route-specific parsing.
- GraphQL: rejected because REST is required.
- Returning `200` with error bodies: rejected as semantically incorrect.

## Consequences

- Contract linting and behavior tests run in CI.
- Error codes are compatibility surface and must not be renamed casually.
- Internal stack traces and database errors never reach clients.

