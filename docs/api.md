# API Reference

## Authentication

- `POST /api/auth/signout`
  - Invalidates session (server-side signout)
  - Returns `{ ok: true }`

## Dashboard

- `GET /api/dashboard`
  - Returns dashboard metrics and chart datasets.

## Alerts

- `GET /api/alerts`
  - Query params: `page`, `pageSize`, `search`, `severity`, `status`, `type`
  - Returns paginated alerts + totals.

- `GET /api/alerts/:id`
  - Returns alert details with overrides merged.

- `PATCH /api/alerts/:id`
  - Updates analyst-facing status/assignee via `alert_overrides`.

- `POST /api/alerts/:id/summarize`
  - Generates/caches an alert summary.
  - If `N8N_ALERT_RESOLUTION_WEBHOOK_URL` is set, calls n8n webhook first.
  - Falls back to Hugging Face summarization when n8n is unavailable.

- `GET /api/alerts/:id/correlation`
  - Returns related alerts by shared context.

## Logs

- `GET /api/logs`
  - Query params: `page`, `pageSize`, `search`
  - Returns paginated logs.

- `GET /api/logs/sources`
  - Returns grouped source data.

## Recommendations

- `GET /api/recommendations`
- `PATCH /api/recommendations/:id`

## Saved Views

- `GET /api/saved-views`
- `POST /api/saved-views`
- `PATCH /api/saved-views/:id`
- `DELETE /api/saved-views/:id`

## Cases

- `GET /api/cases`
  - Optional: `alertId`
  - Returns case list.

- `POST /api/cases`
  - Creates case from alert; seeds playbook tasks and primary alert link.

- `GET /api/cases/assignees`
  - Returns assignee/workload options.

- `GET /api/cases/:id`
  - Returns case + notes + tasks + evidence + activity.

- `PATCH /api/cases/:id`
  - Updates case fields (status, priority, assignee, dueAt, etc).

- `POST /api/cases/:id/notes`
- `POST /api/cases/:id/tasks`
- `PATCH /api/cases/:id/tasks/:taskId`
- `POST /api/cases/:id/evidence`
  - Supports metadata fields for chain-of-custody: `filePath`, `fileSizeBytes`, `contentType`, `sha256`.

### Case workflow entities

- `POST /api/cases/:id/hypotheses`
- `PATCH /api/cases/:id/hypotheses/:hypothesisId`

- `POST /api/cases/:id/response-actions`
- `PATCH /api/cases/:id/response-actions/:actionId`

- `POST /api/cases/:id/timeline`
- `PATCH /api/cases/:id/timeline/:eventId`

### Case links

- `GET /api/cases/:id/alerts`
- `POST /api/cases/:id/alerts`
- `DELETE /api/cases/:id/alerts?alertId=...`

- `GET /api/cases/:id/logs`
- `POST /api/cases/:id/logs`
- `DELETE /api/cases/:id/logs?logId=...`

### Case graph

- `GET /api/cases/:id/graph`
  - Returns board-ready node/edge graph from linked alerts/logs.

### Case playbook execution

- `GET /api/cases/:id/playbook`
  - Returns bound playbook execution, per-step state, and stage progress.
- `POST /api/cases/:id/playbook`
  - `{ action: "bind", templateId? }` binds or rebinds playbook to case.
  - `{ action: "reseed" }` seeds missing case tasks from playbook steps.
- `PATCH /api/cases/:id/playbook/steps/:stepStatusId`
  - Updates step status/notes (`pending|in_progress|completed|skipped|blocked`).

## Playbooks

- `GET /api/playbooks`
  - Lists playbook templates, current version, and current steps.
- `POST /api/playbooks`
  - Creates template + approved v1 steps.
- `GET /api/playbooks/:id`
  - Returns template with full version history and step sets.
- `PATCH /api/playbooks/:id`
  - Updates metadata; when `steps` is provided creates a new draft/approved version.
- `DELETE /api/playbooks/:id`
  - Deletes template when unused, otherwise deactivates it.
- `POST /api/playbooks/:id/approve`
  - Approves a version and promotes it as current.
- `POST /api/playbooks/:id/rollback`
  - Sets current version to a previous approved version.

## Feature Flags and SOC Metrics

- `GET /api/feature-flags`
- `PATCH /api/feature-flags`
  - Admin-only flag updates (`experimental_playbooks`).
- `GET /api/metrics/soc`
  - MTTA/MTTR/reopen rate/false-positive rate/SLA breach trend/workload.

## Boards

- `GET /api/boards`
- `POST /api/boards`

- `GET /api/boards/:id`
- `PATCH /api/boards/:id`
- `DELETE /api/boards/:id`

- `PUT /api/boards/:id/state`
  - Persists viewport, nodes, edges as full snapshot.

## Chat

- `POST /api/chat`
  - AI assistant endpoint.
