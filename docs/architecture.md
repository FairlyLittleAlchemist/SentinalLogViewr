# Architecture

## Overview

Sentinel Azure Logs is a SOC operations platform built on Next.js + Supabase. It combines:
- event ingestion and normalization,
- alert/log triage,
- case management,
- visual investigation boards,
- role-based access control.

## Runtime Model

- Frontend and API run in one Next.js app (`app/` + App Router API routes).
- Supabase provides PostgreSQL, Auth, and RLS.
- ETL scripts ingest CSVs into `stg_events`, then publish into `alerts` / `logs`.

## Key Domains

### Ingestion Domain
- Source CSVs are processed by `scripts/ingest-dashboard-data.cjs`.
- Records are normalized into `stg_events` with parsed payload metadata.
- Finalization SQL populates operational tables and summary tables.

### Detection/Triage Domain
- Analysts browse `alerts` and `logs`.
- Alert overrides (`alert_overrides`) track analyst status/assignee decisions.
- Correlation endpoint links potentially related alerts.

### Case Management Domain
- Cases are represented by `alert_cases`.
- Each case can hold:
  - notes,
  - tasks,
  - evidence,
  - activity timeline,
  - linked alerts,
  - linked logs.
- Advanced workflow state is also tracked:
  - workflow phase/disposition/confidence,
  - hypotheses,
  - response actions,
  - timeline milestones,
  - closure/post-incident summaries.
- SLA and escalation metadata are tracked in case columns.

### Investigation Board Domain
- Boards are optional visual workspaces linked to cases.
- Board state is persisted as node/edge records and viewport.
- Case -> Board bootstrap uses `/api/cases/[id]/graph`.

## Security Model

- Middleware enforces authentication + role checks.
- Supabase RLS policies restrict read/write behavior by role and user.
- Admin/analyst perform write actions; viewer is generally read-only.

## Main User Workflows

1. Ingest data.
2. Triage alerts/logs.
3. Create case from alert.
4. Add related alerts/logs + notes/tasks/evidence.
5. Open board and model relationships.
6. Resolve and close case.

## Component Boundaries

- `app/` pages: screen orchestration and UX.
- `app/api/` routes: server operations and DB interaction.
- `lib/` modules: shared domain logic (auth, parsing, SLA, playbooks).
- `components/ui/`: reusable shadcn primitives.

## Reliability Notes

- Ingest has retries and chunked finalize behavior.
- Middleware includes Supabase reachability handling.
- Smoke script validates alert type split.
