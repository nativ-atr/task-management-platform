# ADR-016: Container runtime topology

- Status: Accepted
- Date: 2026-08-19

## Context

The repository needs a Docker runtime that runs the React client, Express API,
and PostgreSQL together while preserving the existing architecture and migration
guarantees. The runtime should be production-build and production-like for local
verification, but it must not pretend that demo users or local port bindings are
real production defaults.

## Decision

Use separate containers for the static client, API, PostgreSQL, and one-shot
operational jobs. The client image serves the Vite production build through an
unprivileged Nginx container and proxies `/api` and `/health` to the API
container. The API image runs only the compiled Express server. Schema migration
is an explicit one-shot Compose service that must complete before the API starts.
Deterministic demo seeding is available through a separate demo Compose override,
not through the base runtime.

The local Compose runtime exposes Nginx on `localhost:8080` as the browser entry
point and binds direct API access to `127.0.0.1:3000` for local smoke tests and
debugging only.

## Alternatives considered

- Single Node container serving API and static assets: simpler locally, but it
  couples frontend serving to the API process and hides the intended public
  reverse-proxy boundary.
- Running migrations during API startup: rejected because migrations are already
  an explicit deployment step and should not run implicitly on every process
  start.
- Always running demo seeds: rejected because demo data is a local convenience,
  not a production runtime behavior.
- Publishing the API as the public entry point: rejected for production-like
  runtime because the browser should use the Nginx entry point.

## Consequences

- Docker verification exercises production builds and the reverse-proxy path.
- API and client containers can be scaled or deployed independently later.
- Deployment operators must run migrations explicitly and decide whether seeding
  is appropriate for their environment.
- The local Compose files are still not a complete production deployment because
  they do not provide TLS termination, authentication, external secret
  management, backups, or operational idempotency cleanup.
