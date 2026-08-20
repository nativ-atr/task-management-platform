# ADR-007: Idempotency keys for all mutation endpoints

- Status: Accepted
- Date: 2026-08-18

## Context

Immediate duplicate transitions are often rejected by state checks, but that is not full retry safety. A delayed duplicate can become valid again after intervening transitions, and a retried create can create duplicate tasks. Clients also need a stable response after losing a successful response.

## Decision

Require `Idempotency-Key` on create, transition, and close. Persist a globally unique key, canonical request fingerprint, execution status, short renewable execution lease, original response status/body, and expiry. Same key plus same completed request returns the original response; same key plus a different fingerprint fails; an identical in-progress key returns a retryable conflict with `Retry-After` when available. A retry may claim an abandoned reservation after lease expiry. Default completed-record retention is 24 hours.

## Alternatives considered

- Rely on sequential/same-status checks: rejected because delayed duplicates can become valid and original responses cannot be recovered.
- Expected version only: prevents stale mutation but does not provide idempotent response replay or protect task creation.
- Client-only duplicate suppression: rejected because transport retries and multiple processes are outside one browser's control.

## Consequences

- Clients must reuse a key for transport retries and generate a new key for a new user action.
- Keys must not be logged.
- Request canonicalization must be deterministic and tested.
- Reservation and lease recovery must be tested. The final task mutation, event, and completed response are still atomic in one business transaction.
- An expiry cleanup process is required operationally.
