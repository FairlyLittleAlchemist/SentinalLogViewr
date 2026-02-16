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
