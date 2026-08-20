# Extensible Task-Management Platform — Functional Specification

## 1. Purpose

Build a production-quality implementation of the assigned task-management domain. The primary evaluation target is a clean separation between generic workflow rules and additive task-specific definitions. Production quality means reliable transactions, concurrency control, retry behavior, auditability, observability, documentation, and comprehensive tests. It does not expand the product into unrelated enterprise features.

## 2. Final product scope

The system supports:

- creating Procurement, Development, and Compliance tasks;
- assigning every task to exactly one seeded user;
- browsing tasks across all users or tasks assigned to a user;
- moving tasks forward or backward through type-defined statuses;
- collecting and validating complete target-status data on every transition;
- assigning the next user on every transition;
- closing an eligible task;
- discovering task types and server-computed available actions;
- viewing the append-only event history of a task;
- safe retries, stale-write protection, and deterministic error responses.

## 3. Domain terminology

- **Task type**: a code-defined workflow definition containing ordered statuses and target-status field requirements.
- **Status**: a positive integer in a task type's contiguous ordered status set.
- **Open task**: a task whose `closedAt` is null.
- **Closed task**: a task whose `closedAt` is set. Closing does not change its integer status.
- **Transition**: a move from the current integer status to a different integer status.
- **Target payload**: the complete task-specific data submitted for the target status of a transition.
- **Effective data**: last-submitted data for visited statuses whose number is less than or equal to the task's current status.
- **Retained historical data**: last-submitted data for previously visited statuses above the current status after a backward transition.
- **Task version**: a positive integer incremented once for every successful status transition or close.
- **Available action**: a server-computed transition or close affordance. It is advisory; mutation validation remains authoritative.

## 4. Generic workflow invariants

1. A task is assigned to exactly one existing user at all times, including after closing.
2. A task is either open or closed.
3. Closed tasks are immutable and cannot be reopened.
4. Statuses are positive ascending integers defined by the task type.
5. A task is created at status `1`.
6. Forward movement must target exactly `currentStatus + 1`.
7. Backward movement may target any defined status lower than `currentStatus`.
8. Same-status transitions are invalid.
9. Every transition, forward or backward, must:
   - supply the complete payload required by the target status;
   - reject unknown payload properties;
   - assign one existing next user;
   - supply the caller's `expectedVersion`;
   - be committed atomically with its audit event and idempotency outcome.
10. Reassignment to the same user is permitted.
11. A task may close only while open and at its type's final status.
12. Closing is not a status transition. It accepts no target payload or next assignee, preserves the current assignee, increments the version, and writes a close event.
13. A task's type is immutable after creation.
14. Creation, transition, and close requests require an idempotency key.

## 5. Task-type definitions

### 5.1 Procurement

| Status | Meaning | Complete target payload |
|---:|---|---|
| 1 | Created | Empty object |
| 2 | Supplier offers received | `quotes`: exactly two trimmed, non-empty strings |
| 3 | Purchase completed | `receipt`: trimmed, non-empty string |

- Initial status: `1`.
- Final status: `3`.
- The two quotes need not be distinct because the assignment does not require uniqueness.

### 5.2 Development

| Status | Meaning | Complete target payload |
|---:|---|---|
| 1 | Created | Empty object |
| 2 | Specification completed | `specification`: trimmed, non-empty string |
| 3 | Development completed | `branchName`: trimmed, non-empty string |
| 4 | Distribution completed | `version`: trimmed, non-empty string |

- Initial status: `1`.
- Final status: `4`.
- `version` is a string so semantic versions such as `1.2.3` are valid.

### 5.3 Compliance

| Status | Meaning | Complete target payload |
|---:|---|---|
| 1 | Created | Empty object |
| 2 | Intake completed | `caseReference`: trimmed, non-empty string |
| 3 | Documents verified | `documentNotes`: trimmed, non-empty string |
| 4 | Compliance review completed | `reviewNotes`: trimmed, non-empty string |
| 5 | Approval completed | `approvalReference`: trimmed, non-empty string |

- Initial status: `1`.
- Final status: `5`.
- Compliance uses only the generic field kinds already supported by the platform.

## 6. Task creation

Input:

- task-type key;
- initial assigned-user ID;
- idempotency key.

Behavior:

- reject an unknown task type;
- reject a missing user;
- create the task at status `1`, open, version `1`, with empty status-keyed data;
- write a `TASK_CREATED` event;
- return the complete task representation;
- do not treat creation as a status transition;
- task-type definitions must therefore require no custom data at status `1`.

## 7. Status transition semantics

Input:

- explicit target status;
- next assigned-user ID;
- expected task version;
- complete target-status payload;
- idempotency key.

Behavior:

1. Resolve or reserve the idempotency record.
2. Lock and load the task inside a database transaction.
3. Reject missing, closed, or stale-version tasks.
4. Resolve the task-type definition and target status.
5. Enforce direction and distance rules.
6. Validate the submitted payload as the complete payload for the target status.
7. Validate the next user.
8. Replace, never merge, the stored payload at the target status key.
9. Change the current status and assignee.
10. Increment the version exactly once.
11. Write a `STATUS_CHANGED` event containing the complete submitted target payload.
12. Store the successful idempotent response and commit atomically.

### 7.1 Re-entry and retained data

- Moving backward does not delete data recorded at higher statuses.
- Only stored data for statuses less than or equal to `currentStatus` is effective current state.
- Stored data for higher statuses is history and must not appear in the task's `effectiveData` response.
- If a transition later re-enters a previously visited status, the request must still submit a complete payload. Historical values may prefill the form but are not silently reused by the server.
- The submitted re-entry payload replaces the previous last-submitted payload for that status; the event log retains every historical submission.

### 7.2 No in-place editing

There is no operation that edits task-specific data while remaining at the same status. Task data changes only at transition boundaries. Correcting data at the current status requires leaving and later re-entering that status. A dedicated amendment operation is outside scope.

## 8. Closing semantics

Input:

- expected task version;
- idempotency key.

Behavior:

- reject a missing task;
- reject an already closed task;
- reject a stale version;
- reject closing before the type's final status;
- set `closedAt` while retaining the final integer status and current assignee;
- increment the version exactly once;
- write a `TASK_CLOSED` event;
- accept no custom payload or next-assignee field;
- commit task, event, and idempotency outcome atomically.

## 9. Idempotency and retry behavior

State-based same-status rejection alone is not sufficient retry safety: a delayed duplicate may arrive after intervening transitions restore a state in which it is valid again.

Required behavior:

- `POST /tasks`, `POST /tasks/{id}/transitions`, and `POST /tasks/{id}/close` require `Idempotency-Key`.
- The key is globally unique within the configured retention period, default 24 hours.
- The request fingerprint includes HTTP method, canonical route including resource ID, and canonical request body.
- A completed key with the same fingerprint returns the originally stored status and response body without another mutation.
- Reusing the key with a different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`.
- A concurrent request for an in-progress identical key returns `409 IDEMPOTENCY_IN_PROGRESS`; clients may retry with backoff.
- The conflict includes `Retry-After` when the current reservation lease has a known remaining duration.
- An in-progress reservation has a short renewable lease. If its owner fails before the business transaction commits, a retry may claim it after lease expiry.
- Expired records may be removed by an operational cleanup job.
- Expected-version checking independently binds transition and close intent to the state the client observed.

## 10. Concurrency

- Transition and close operations lock the task row within one PostgreSQL transaction.
- `expectedVersion` must equal the locked task's version.
- A mismatch returns `409 VERSION_CONFLICT` without mutation.
- The closed check and all workflow validation occur after the lock is acquired.
- Only one competing mutation may commit from a given task version.
- Task state, event, and idempotency outcome are atomic.

## 11. Read models

### 11.1 Task representation

The normal task representation includes:

- identity, type, status, open/closed state, assignee, version, and timestamps;
- `effectiveData`: only last-submitted payloads for statuses `<= currentStatus`;
- `availableActions`: all legal directional targets and an optional close affordance.

It must not expose retained higher-status data as current state.

The client must render current effective task data with task-type status and
field labels from the task-type metadata. Statuses that define no fields are
omitted from the data presentation. Internal status numbers and raw JSON are not
primary user-facing copy.

### 11.2 Available transitions

Each available transition includes:

- target status and label;
- direction (`FORWARD` or `BACKWARD`);
- serializable required-field metadata;
- `currentValues`, populated from the last payload stored for that target status when available.

For an open task:

- expose the next sequential forward target when one exists;
- expose every lower status as a backward target;
- expose close only at the final status.

For a closed task, expose no mutations.

The server must revalidate actions at execution time.

### 11.3 Task lists

- Return tasks across all users when no assignee filter is provided.
- Return tasks currently assigned to the requested user.
- Include open and closed tasks by default.
- Support optional assignee filtering, open/closed filtering, opaque cursor pagination, and `totalCount` for the complete filtered result independently of the current page.
- Return `400 BAD_REQUEST` for an invalid assignee UUID and `404 USER_NOT_FOUND` for an unknown assignee.
- Keep the assigned-user endpoint for compatibility and back it with the same generic task-list behavior.
- The client must not display a selected task that is excluded by active filters.
- Task creation must keep initial assignment visually separate from browsing filters and adjust filters after successful creation so the new open task is visible and selected.

### 11.4 Event history

- Return append-only events in deterministic chronological order with cursor pagination.
- Event payload is the complete target-status submission for `STATUS_CHANGED` and empty for create/close.
- Audit rows are self-contained records of their event, not full snapshots of every task field.
- The client presents events in the server-provided order with readable labels
  such as task creation, movement to or back to a status, and task closure. It
  must not fabricate actors; if a historical user ID cannot be resolved from the
  user read model, it displays a neutral fallback.

## 12. Error behavior

All errors use the contract in `docs/api/openapi.yaml`:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "The task has changed since it was read.",
    "details": {},
    "requestId": "request-id"
  }
}
```

Status policy:

- `400`: malformed request, invalid header, or invalid cursor.
- `404`: missing task or user.
- `409`: current-state conflict, version conflict, closed task, illegal transition, premature close, or idempotency conflict.
- `422`: structurally valid request containing an unknown type/status or invalid task-specific payload.
- `500`: unexpected internal failure with no sensitive details.
- `503`: readiness dependency unavailable.

## 13. Runtime task-definition validation

The application must fail startup when any registered definition has:

- a duplicate type key;
- an initial status other than `1`;
- non-positive, duplicate, non-contiguous, or unordered status numbers;
- a missing final status or a final status that is not the highest status;
- required data at status `1`;
- duplicate field names;
- unsupported field kinds;
- inconsistent field metadata and validator behavior.

## 14. Security and operational requirements

- Validate every external input and reject unknown properties.
- Use parameterized database access through TypeORM.
- Add security headers, explicit CORS configuration, and body-size limits.
- Use structured logs and propagate a request ID.
- Do not log custom payloads, idempotency keys, database credentials, or stack traces to clients.
- Validate environment configuration at startup.
- Support graceful shutdown.
- Provide liveness and readiness endpoints.
- Use migrations; `synchronize: true` is forbidden.
- Seed deterministic demo users.

## 15. Acceptance criteria

### 15.1 Functional

- All registered task types can complete their entire lifecycle.
- Every forward move advances exactly one status.
- Every lower status is a valid backward target when the task is open.
- Same-status and skipped-forward transitions fail.
- Every transition requires a next assignee and complete valid target payload.
- Backward movement and re-entry use replacement semantics and preserve audit history.
- Effective data excludes retained data above the current status.
- Close succeeds only from the final status and retains the assignee.
- Closed tasks expose no available mutations and reject all mutations.
- Generic and assigned-user task retrieval works with assignee filtering, state filtering, cursor pagination, and `totalCount`.
- The client separates task browsing filters from task creation, supports all-user browsing, and clearly distinguishes open and closed tasks with text and color.
- The client presents available actions before the grouped Current task data
  panel for open tasks, presents closed tasks as read-only, and omits mutation
  controls for closed tasks.
- Current task data and activity are presented with business labels rather than
  raw JSON or internal event names as primary UI text. Activity remains the
  historical transition source.
- Task type metadata and available actions support generic client forms.

### 15.2 Extensibility

- Compliance works as a third registered type by adding one definition and
  registering it.
- The workflow engine, persistence schema, controllers, routes, application use cases, and existing definitions remain unchanged.
- The generic client renders a third type that uses existing field kinds without type-specific branching.

### 15.3 Reliability

- Competing mutations from one version cannot both commit.
- Transition/close races cannot violate closure or sequencing rules.
- Same-key retries return the original response.
- Same-key/different-request attempts fail.
- Delayed duplicates with stale versions cannot mutate the task.
- Task, event, and idempotency outcome roll back together on failure.

### 15.4 Delivery

- A clean checkout installs, migrates, seeds, tests, builds, and starts using documented commands.
- OpenAPI validates and matches observed HTTP behavior.
- Lint, formatting, strict type-checking, unit, integration, component, concurrency, idempotency, and end-to-end tests pass.
- No task-type conditional branching exists outside definitions, fixtures, or tests.

### 15.5 README delivery contract

The implemented repository's root `README.md` must contain:

1. project overview;
2. summary of the core guarantees;
3. architecture at a glance;
4. technology stack;
5. project structure;
6. domain/workflow semantics;
7. API contract and OpenAPI location;
8. data model;
9. ADR index with concise summaries and links to full ADRs;
10. local running instructions;
11. environment configuration;
12. migrations and deterministic seed instructions;
13. testing commands and test-layer explanation;
14. observability, health, and graceful-shutdown behavior;
15. security considerations;
16. known limitations;
17. precise steps for adding another task type;
18. production deployment considerations.

Instructions must be verified from a clean checkout and clean database.

## 16. Out of scope

- Authentication, authorization, invitations, and user administration.
- Reopening closed tasks.
- In-place amendments to current-status data.
- Deleting tasks or audit events.
- Notifications, comments, attachments, search, and reporting.
- A workflow-definition administration UI or database-authored workflow DSL.
- Per-task-type database tables or columns.
- Microservices, queues, CQRS, event sourcing, GraphQL, WebSockets, and real-time collaboration.
- Multi-tenancy and organization boundaries.
- Production orchestration such as Kubernetes.

## 17. Known limitations

- Without authentication, caller identity is not established and transitions are not authorized against the current assignee. The domain and API boundaries must allow a future authenticated principal and authorization policy.
- Idempotency records require operational expiry cleanup.
- Supported dynamic form behavior is limited to the field vocabulary defined by the application. A new field kind requires a generic validator and renderer addition, though it must not require task-type branching.
- Code-defined task types require deployment to add or change a workflow.

## 18. Open decisions and genuine ambiguities

None. Previously ambiguous points—including backward distance, backward payload handling, re-entry behavior, close semantics, version representation, effective data, concurrency, retry semantics, and authentication scope—are resolved above. If implementation reveals a contradiction between this specification and the OpenAPI contract, stop and reconcile the repository documents rather than inventing behavior.
