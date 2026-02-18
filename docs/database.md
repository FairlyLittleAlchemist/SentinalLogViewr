# Database Guide

## Engine and access

- Backend: Supabase Postgres
- Local default URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Schema: `public`

## Core table groups

### Ingestion pipeline

- `ingest_runs`: ETL run metadata and status.
- `stg_events`: normalized stage records before publish.

### Operational security data

- `alerts`: primary alert stream used by SOC workflows.
- `logs`: primary log stream used by investigations.
- `incidents`, `security_events`, `activity_events`, `firewall_events`: typed alert projections.
- `alert_overrides`: analyst-controlled status/assignee overlay.

### Cases

- `alert_cases`: case header with SLA/escalation fields.
- `alert_case_notes`: case notes.
- `alert_case_tasks`: case tasks.
- `alert_case_evidence`: evidence records.
- `alert_case_activity`: immutable activity log/audit trail.
- `alert_case_alerts`: links alerts to cases (relation + primary marker).
- `alert_case_logs`: links logs to cases (relation type).
- `alert_case_hypotheses`: hypothesis tracking (statement/confidence/status).
- `alert_case_response_actions`: containment and response actions.
- `alert_case_timeline_events`: investigation timeline checkpoints.
- `case_playbook_executions`: bound playbook template/version and strict-mode execution state per case.
- `case_playbook_step_status`: status progression for each playbook step in a case execution.

### Playbooks and feature flags

- `feature_flags`: admin-managed experimental flags (e.g. `experimental_playbooks`).
- `playbook_templates`: runbook template metadata and active/current version pointer.
- `playbook_template_versions`: version history (`draft|approved|archived`) with approval metadata.
- `playbook_template_steps`: ordered stage-tagged steps for each version.

### Investigation board

- `investigation_boards`: board metadata, owner, optional `case_id`, viewport.
- `investigation_board_nodes`: persisted nodes.
- `investigation_board_edges`: persisted edges.

### Dashboard/read model tables

- `threat_metrics`
- `alert_time_series`
- `severity_distribution`
- `attack_sources`

### Identity and personalization

- `profiles`: user profile + role.
- `saved_alert_views`: saved alert filter presets.
- `recommendations`: recommendation records.

## Relationship map

- `stg_events.ingest_run_id -> ingest_runs.id`
- `alert_cases.alert_id -> alerts.id`
- `alert_case_alerts.case_id -> alert_cases.id`
- `alert_case_alerts.alert_id -> alerts.id`
- `alert_case_logs.case_id -> alert_cases.id`
- `alert_case_logs.log_id -> logs.id`
- `alert_case_notes.case_id -> alert_cases.id`
- `alert_case_tasks.case_id -> alert_cases.id`
- `alert_case_evidence.case_id -> alert_cases.id`
- `alert_case_activity.case_id -> alert_cases.id`
- `alert_case_hypotheses.case_id -> alert_cases.id`
- `alert_case_response_actions.case_id -> alert_cases.id`
- `alert_case_timeline_events.case_id -> alert_cases.id`
- `case_playbook_executions.case_id -> alert_cases.id`
- `case_playbook_executions.template_id -> playbook_templates.id`
- `case_playbook_executions.version_id -> playbook_template_versions.id`
- `case_playbook_step_status.execution_id -> case_playbook_executions.id`
- `case_playbook_step_status.step_id -> playbook_template_steps.id`
- `alert_overrides.alert_id -> alerts.id`
- `investigation_boards.case_id -> alert_cases.id`
- `investigation_board_nodes.board_id -> investigation_boards.id`
- `investigation_board_edges.board_id -> investigation_boards.id`

## Security model (RLS)

- RLS enabled for operational and case/board tables.
- Read is generally allowed for authenticated users.
- Write is generally restricted to `admin`/`analyst` via `has_role(...)` policy checks.

## Migration timeline

- `20260206110000_create_profiles.sql`
- `20260206123000_fix_profiles_policies.sql`
- `20260206130000_mock_data_to_db.sql`
- `20260213150000_etl_schema_upgrade.sql`
- `20260213170000_etl_v2_two_layer.sql`
- `20260213210000_parsed_facts_and_finalize.sql`
- `20260213213000_finalize_chunked.sql`
- `20260214090000_type_safe_siem.sql`
- `20260214113000_backfill_alert_types.sql`
- `20260214203000_saved_views_and_case_management.sql`
- `20260214213000_case_playbooks_sla_assignment.sql`
- `20260214230000_investigation_boards.sql`
- `20260215193000_case_alert_links.sql`
- `20260215195500_case_log_links.sql`
- `20260216193000_case_workflow_refinement.sql`
- `20260216230000_playbooks_feature_flags_and_execution.sql`

## Full schema export command

When Docker/Supabase local DB is running, you can generate full column-level docs with:

```powershell
node scripts/export-db-schema.cjs
```

This command writes `docs/database-schema-full.md`.

ER diagram:
- `docs/database-er-diagram.md`
