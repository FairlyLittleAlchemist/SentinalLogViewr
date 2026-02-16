# Database Schema (Full)

Generated from live DB on 2026-02-16T22:34:36.393Z

Connection used: `postgresql://postgres:***@127.0.0.1:54322/postgres`

## Tables

- activity_events
- alert_case_activity
- alert_case_alerts
- alert_case_evidence
- alert_case_hypotheses
- alert_case_logs
- alert_case_notes
- alert_case_response_actions
- alert_case_tasks
- alert_case_timeline_events
- alert_cases
- alert_overrides
- alert_time_series
- alerts
- attack_sources
- firewall_events
- incidents
- ingest_runs
- investigation_board_edges
- investigation_board_nodes
- investigation_boards
- logs
- profiles
- recommendations
- saved_alert_views
- security_events
- severity_distribution
- stg_events
- threat_metrics

## activity_events

Primary key: none

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no |  |
| title | text | no |  |
| severity | text | no |  |
| status | text | no |  |
| detected_status | text | no |  |
| source | text | no |  |
| provider | text | yes |  |
| category | text | yes |  |
| timestamp | timestamp with time zone | no |  |
| description | text | yes |  |
| assignee | text | yes |  |
| tactics | _text[] | no |  |
| affected_entities | _text[] | no |  |
| recommended_actions | _text[] | no |  |
| event_code | text | yes |  |
| event_name | text | yes |  |
| actor | text | yes |  |
| resource | text | yes |  |
| ip_address | text | yes |  |
| payload_raw | text | yes |  |
| payload_json | jsonb | yes |  |
| parsed_facts | jsonb | yes |  |
| source_file | text | yes |  |
| summary | text | yes |  |

## alert_case_activity

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| case_id | uuid | no |  |
| action | text | no |  |
| details | jsonb | no | '{}'::jsonb |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_activity_case_id_idx`: CREATE INDEX alert_case_activity_case_id_idx ON public.alert_case_activity USING btree (case_id)
- `alert_case_activity_created_at_idx`: CREATE INDEX alert_case_activity_created_at_idx ON public.alert_case_activity USING btree (created_at DESC)
- `alert_case_activity_pkey`: CREATE UNIQUE INDEX alert_case_activity_pkey ON public.alert_case_activity USING btree (id)

## alert_case_alerts

Primary key: `case_id, alert_id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| case_id | uuid | no |  |
| alert_id | text | no |  |
| relation_type | text | no | 'related_to'::text |
| is_primary | boolean | no | false |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone | no | now() |

Foreign keys:
- `alert_id` -> `alerts.id`
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_alerts_alert_id_idx`: CREATE INDEX alert_case_alerts_alert_id_idx ON public.alert_case_alerts USING btree (alert_id)
- `alert_case_alerts_case_id_idx`: CREATE INDEX alert_case_alerts_case_id_idx ON public.alert_case_alerts USING btree (case_id)
- `alert_case_alerts_created_at_idx`: CREATE INDEX alert_case_alerts_created_at_idx ON public.alert_case_alerts USING btree (created_at DESC)
- `alert_case_alerts_pkey`: CREATE UNIQUE INDEX alert_case_alerts_pkey ON public.alert_case_alerts USING btree (case_id, alert_id)

## alert_case_evidence

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| case_id | uuid | no |  |
| label | text | no |  |
| evidence_type | text | no | 'link'::text |
| url | text | yes |  |
| details | text | yes |  |
| created_by | uuid | no |  |
| created_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_evidence_case_id_idx`: CREATE INDEX alert_case_evidence_case_id_idx ON public.alert_case_evidence USING btree (case_id)
- `alert_case_evidence_pkey`: CREATE UNIQUE INDEX alert_case_evidence_pkey ON public.alert_case_evidence USING btree (id)

## alert_case_hypotheses

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| case_id | uuid | no |  |
| statement | text | no |  |
| confidence | integer | no | 50 |
| status | text | no | 'open'::text |
| evidence_summary | text | yes |  |
| created_by | uuid | yes |  |
| updated_by | uuid | yes |  |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_hypotheses_case_id_idx`: CREATE INDEX alert_case_hypotheses_case_id_idx ON public.alert_case_hypotheses USING btree (case_id)
- `alert_case_hypotheses_pkey`: CREATE UNIQUE INDEX alert_case_hypotheses_pkey ON public.alert_case_hypotheses USING btree (id)
- `alert_case_hypotheses_status_idx`: CREATE INDEX alert_case_hypotheses_status_idx ON public.alert_case_hypotheses USING btree (status)

## alert_case_logs

Primary key: `case_id, log_id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| case_id | uuid | no |  |
| log_id | text | no |  |
| relation_type | text | no | 'related_to'::text |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`
- `log_id` -> `logs.id`

Indexes:
- `alert_case_logs_case_id_idx`: CREATE INDEX alert_case_logs_case_id_idx ON public.alert_case_logs USING btree (case_id)
- `alert_case_logs_created_at_idx`: CREATE INDEX alert_case_logs_created_at_idx ON public.alert_case_logs USING btree (created_at DESC)
- `alert_case_logs_log_id_idx`: CREATE INDEX alert_case_logs_log_id_idx ON public.alert_case_logs USING btree (log_id)
- `alert_case_logs_pkey`: CREATE UNIQUE INDEX alert_case_logs_pkey ON public.alert_case_logs USING btree (case_id, log_id)

## alert_case_notes

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| case_id | uuid | no |  |
| body | text | no |  |
| created_by | uuid | no |  |
| created_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_notes_case_id_idx`: CREATE INDEX alert_case_notes_case_id_idx ON public.alert_case_notes USING btree (case_id)
- `alert_case_notes_pkey`: CREATE UNIQUE INDEX alert_case_notes_pkey ON public.alert_case_notes USING btree (id)

## alert_case_response_actions

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| case_id | uuid | no |  |
| action_type | text | no |  |
| target | text | no |  |
| status | text | no | 'planned'::text |
| details | text | yes |  |
| executed_by | uuid | yes |  |
| executed_at | timestamp with time zone | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_response_actions_case_id_idx`: CREATE INDEX alert_case_response_actions_case_id_idx ON public.alert_case_response_actions USING btree (case_id)
- `alert_case_response_actions_pkey`: CREATE UNIQUE INDEX alert_case_response_actions_pkey ON public.alert_case_response_actions USING btree (id)
- `alert_case_response_actions_status_idx`: CREATE INDEX alert_case_response_actions_status_idx ON public.alert_case_response_actions USING btree (status)

## alert_case_tasks

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| case_id | uuid | no |  |
| title | text | no |  |
| is_done | boolean | no | false |
| due_at | timestamp with time zone | yes |  |
| created_by | uuid | no |  |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_tasks_case_id_idx`: CREATE INDEX alert_case_tasks_case_id_idx ON public.alert_case_tasks USING btree (case_id)
- `alert_case_tasks_done_idx`: CREATE INDEX alert_case_tasks_done_idx ON public.alert_case_tasks USING btree (is_done)
- `alert_case_tasks_pkey`: CREATE UNIQUE INDEX alert_case_tasks_pkey ON public.alert_case_tasks USING btree (id)

## alert_case_timeline_events

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| case_id | uuid | no |  |
| event_type | text | no |  |
| title | text | no |  |
| event_at | timestamp with time zone | no |  |
| details | text | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `alert_case_timeline_events_case_id_idx`: CREATE INDEX alert_case_timeline_events_case_id_idx ON public.alert_case_timeline_events USING btree (case_id)
- `alert_case_timeline_events_event_at_idx`: CREATE INDEX alert_case_timeline_events_event_at_idx ON public.alert_case_timeline_events USING btree (event_at)
- `alert_case_timeline_events_pkey`: CREATE UNIQUE INDEX alert_case_timeline_events_pkey ON public.alert_case_timeline_events USING btree (id)

## alert_cases

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| alert_id | text | no |  |
| title | text | no |  |
| status | text | no | 'open'::text |
| priority | text | no | 'medium'::text |
| assignee | text | yes |  |
| created_by | uuid | no |  |
| updated_by | uuid | yes |  |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |
| alert_type | text | yes |  |
| alert_severity | text | yes |  |
| playbook_key | text | yes |  |
| due_at | timestamp with time zone | yes |  |
| sla_status | text | no | 'on_track'::text |
| escalation_level | integer | no | 0 |
| escalation_target | text | yes |  |
| escalated_at | timestamp with time zone | yes |  |
| assignee_user_id | uuid | yes |  |
| workflow_phase | text | no | 'triage'::text |
| disposition | text | yes |  |
| confidence_score | integer | no | 50 |
| business_impact | text | yes |  |
| root_cause | text | yes |  |
| containment_summary | text | yes |  |
| recovery_summary | text | yes |  |
| post_incident_summary | text | yes |  |
| resolved_at | timestamp with time zone | yes |  |
| closed_at | timestamp with time zone | yes |  |

Foreign keys:
- `alert_id` -> `alerts.id`

Indexes:
- `alert_cases_alert_id_idx`: CREATE INDEX alert_cases_alert_id_idx ON public.alert_cases USING btree (alert_id)
- `alert_cases_assignee_user_id_idx`: CREATE INDEX alert_cases_assignee_user_id_idx ON public.alert_cases USING btree (assignee_user_id)
- `alert_cases_created_at_idx`: CREATE INDEX alert_cases_created_at_idx ON public.alert_cases USING btree (created_at DESC)
- `alert_cases_disposition_idx`: CREATE INDEX alert_cases_disposition_idx ON public.alert_cases USING btree (disposition)
- `alert_cases_due_at_idx`: CREATE INDEX alert_cases_due_at_idx ON public.alert_cases USING btree (due_at)
- `alert_cases_pkey`: CREATE UNIQUE INDEX alert_cases_pkey ON public.alert_cases USING btree (id)
- `alert_cases_sla_status_idx`: CREATE INDEX alert_cases_sla_status_idx ON public.alert_cases USING btree (sla_status)
- `alert_cases_status_idx`: CREATE INDEX alert_cases_status_idx ON public.alert_cases USING btree (status)
- `alert_cases_workflow_phase_idx`: CREATE INDEX alert_cases_workflow_phase_idx ON public.alert_cases USING btree (workflow_phase)

## alert_overrides

Primary key: `alert_id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| alert_id | text | no |  |
| status | text | yes |  |
| assignee | text | yes |  |
| updated_at | timestamp with time zone | no | now() |
| updated_by | uuid | yes |  |

Foreign keys:
- `alert_id` -> `alerts.id`

Indexes:
- `alert_overrides_pkey`: CREATE UNIQUE INDEX alert_overrides_pkey ON public.alert_overrides USING btree (alert_id)

## alert_time_series

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | bigint | no | nextval('alert_time_series_id_seq'::regclass) |
| time | text | no |  |
| critical | integer | no |  |
| high | integer | no |  |
| medium | integer | no |  |
| low | integer | no |  |

Indexes:
- `alert_time_series_pkey`: CREATE UNIQUE INDEX alert_time_series_pkey ON public.alert_time_series USING btree (id)

## alerts

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no |  |
| title | text | no |  |
| severity | text | no |  |
| status | text | no |  |
| source | text | no |  |
| timestamp | timestamp with time zone | no |  |
| description | text | no |  |
| assignee | text | yes |  |
| tactics | _text[] | no |  |
| affected_entities | _text[] | no |  |
| recommended_actions | _text[] | no |  |
| provider | text | yes |  |
| category | text | yes |  |
| event_code | text | yes |  |
| event_name | text | yes |  |
| actor | text | yes |  |
| resource | text | yes |  |
| ip_address | text | yes |  |
| payload_raw | text | yes |  |
| payload_json | jsonb | yes |  |
| source_file | text | yes |  |
| detected_status | text | no |  |
| parsed_facts | jsonb | yes |  |
| type | text | yes |  |
| summary | text | yes |  |

Indexes:
- `alerts_event_code_idx`: CREATE INDEX alerts_event_code_idx ON public.alerts USING btree (event_code)
- `alerts_pkey`: CREATE UNIQUE INDEX alerts_pkey ON public.alerts USING btree (id)
- `alerts_severity_idx`: CREATE INDEX alerts_severity_idx ON public.alerts USING btree (severity)
- `alerts_source_idx`: CREATE INDEX alerts_source_idx ON public.alerts USING btree (source)
- `alerts_timestamp_idx`: CREATE INDEX alerts_timestamp_idx ON public.alerts USING btree ("timestamp" DESC)
- `alerts_type_idx`: CREATE INDEX alerts_type_idx ON public.alerts USING btree (type)

## attack_sources

Primary key: `country`

| Column | Type | Nullable | Default |
|---|---|---|---|
| country | text | no |  |
| count | integer | no |  |
| percentage | numeric | no |  |
| source_type | text | yes |  |

Indexes:
- `attack_sources_pkey`: CREATE UNIQUE INDEX attack_sources_pkey ON public.attack_sources USING btree (country)

## firewall_events

Primary key: none

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no |  |
| title | text | no |  |
| severity | text | no |  |
| status | text | no |  |
| detected_status | text | no |  |
| source | text | no |  |
| provider | text | yes |  |
| category | text | yes |  |
| timestamp | timestamp with time zone | no |  |
| description | text | yes |  |
| assignee | text | yes |  |
| tactics | _text[] | no |  |
| affected_entities | _text[] | no |  |
| recommended_actions | _text[] | no |  |
| event_code | text | yes |  |
| event_name | text | yes |  |
| actor | text | yes |  |
| resource | text | yes |  |
| ip_address | text | yes |  |
| payload_raw | text | yes |  |
| payload_json | jsonb | yes |  |
| parsed_facts | jsonb | yes |  |
| source_file | text | yes |  |
| summary | text | yes |  |

## incidents

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no |  |
| title | text | no |  |
| severity | text | no |  |
| status | text | no |  |
| detected_status | text | no |  |
| source | text | no |  |
| provider | text | yes |  |
| category | text | yes |  |
| timestamp | timestamp with time zone | no |  |
| description | text | yes |  |
| assignee | text | yes |  |
| tactics | _text[] | no | '{}'::text[] |
| affected_entities | _text[] | no | '{}'::text[] |
| recommended_actions | _text[] | no | '{}'::text[] |
| event_code | text | yes |  |
| event_name | text | yes |  |
| actor | text | yes |  |
| resource | text | yes |  |
| ip_address | text | yes |  |
| payload_raw | text | yes |  |
| payload_json | jsonb | yes |  |
| parsed_facts | jsonb | yes |  |
| source_file | text | yes |  |
| summary | text | yes |  |

Indexes:
- `incidents_pkey`: CREATE UNIQUE INDEX incidents_pkey ON public.incidents USING btree (id)

## ingest_runs

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| started_at | timestamp with time zone | no | now() |
| finished_at | timestamp with time zone | yes |  |
| status | text | no | 'running'::text |
| source_manifest | jsonb | no | '[]'::jsonb |
| rows_seen | integer | no | 0 |
| rows_loaded | integer | no | 0 |
| rows_rejected | integer | no | 0 |
| error_summary | text | yes |  |

Indexes:
- `ingest_runs_pkey`: CREATE UNIQUE INDEX ingest_runs_pkey ON public.ingest_runs USING btree (id)

## investigation_board_edges

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| board_id | uuid | no |  |
| edge_id | text | no |  |
| source_node_id | text | no |  |
| target_node_id | text | no |  |
| edge_type | text | no | 'related_to'::text |
| label | text | yes |  |
| data | jsonb | no | '{}'::jsonb |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Foreign keys:
- `board_id` -> `investigation_boards.id`

Indexes:
- `investigation_board_edges_board_id_edge_id_key`: CREATE UNIQUE INDEX investigation_board_edges_board_id_edge_id_key ON public.investigation_board_edges USING btree (board_id, edge_id)
- `investigation_board_edges_board_idx`: CREATE INDEX investigation_board_edges_board_idx ON public.investigation_board_edges USING btree (board_id)
- `investigation_board_edges_pkey`: CREATE UNIQUE INDEX investigation_board_edges_pkey ON public.investigation_board_edges USING btree (id)

## investigation_board_nodes

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| board_id | uuid | no |  |
| node_id | text | no |  |
| node_type | text | no |  |
| ref_id | text | yes |  |
| label | text | no |  |
| subtitle | text | yes |  |
| x | numeric | no | 0 |
| y | numeric | no | 0 |
| data | jsonb | no | '{}'::jsonb |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Foreign keys:
- `board_id` -> `investigation_boards.id`

Indexes:
- `investigation_board_nodes_board_id_node_id_key`: CREATE UNIQUE INDEX investigation_board_nodes_board_id_node_id_key ON public.investigation_board_nodes USING btree (board_id, node_id)
- `investigation_board_nodes_board_idx`: CREATE INDEX investigation_board_nodes_board_idx ON public.investigation_board_nodes USING btree (board_id)
- `investigation_board_nodes_pkey`: CREATE UNIQUE INDEX investigation_board_nodes_pkey ON public.investigation_board_nodes USING btree (id)

## investigation_boards

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| name | text | no |  |
| owner_id | uuid | no |  |
| case_id | uuid | yes |  |
| is_shared | boolean | no | false |
| viewport | jsonb | no | '{"x": 0, "y": 0, "zoom": 1}'::jsonb |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Foreign keys:
- `case_id` -> `alert_cases.id`

Indexes:
- `investigation_boards_owner_idx`: CREATE INDEX investigation_boards_owner_idx ON public.investigation_boards USING btree (owner_id)
- `investigation_boards_pkey`: CREATE UNIQUE INDEX investigation_boards_pkey ON public.investigation_boards USING btree (id)

## logs

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no |  |
| timestamp | timestamp with time zone | no |  |
| severity | text | no |  |
| source | text | no |  |
| category | text | no |  |
| message | text | no |  |
| ip_address | text | no |  |
| user | text | no |  |
| status | text | no |  |
| provider | text | yes |  |
| event_code | text | yes |  |
| event_name | text | yes |  |
| actor | text | yes |  |
| resource | text | yes |  |
| payload_raw | text | yes |  |
| payload_json | jsonb | yes |  |
| source_file | text | yes |  |
| parsed_facts | jsonb | yes |  |

Indexes:
- `logs_event_code_idx`: CREATE INDEX logs_event_code_idx ON public.logs USING btree (event_code)
- `logs_pkey`: CREATE UNIQUE INDEX logs_pkey ON public.logs USING btree (id)
- `logs_severity_idx`: CREATE INDEX logs_severity_idx ON public.logs USING btree (severity)
- `logs_source_idx`: CREATE INDEX logs_source_idx ON public.logs USING btree (source)
- `logs_timestamp_idx`: CREATE INDEX logs_timestamp_idx ON public.logs USING btree ("timestamp" DESC)

## profiles

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no |  |
| email | text | yes |  |
| full_name | text | yes |  |
| role | text | no | 'viewer'::text |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Indexes:
- `profiles_pkey`: CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)

## recommendations

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no |  |
| title | text | no |  |
| priority | text | no |  |
| category | text | no |  |
| description | text | no |  |
| impact | text | no |  |
| effort | text | no |  |
| status | text | no |  |
| related_alerts | _text[] | no |  |

Indexes:
- `recommendations_pkey`: CREATE UNIQUE INDEX recommendations_pkey ON public.recommendations USING btree (id)

## saved_alert_views

Primary key: `id`

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() |
| user_id | uuid | no |  |
| name | text | no |  |
| filters | jsonb | no | '{}'::jsonb |
| is_shared | boolean | no | false |
| share_token | text | yes |  |
| created_at | timestamp with time zone | no | now() |
| updated_at | timestamp with time zone | no | now() |

Indexes:
- `saved_alert_views_pkey`: CREATE UNIQUE INDEX saved_alert_views_pkey ON public.saved_alert_views USING btree (id)
- `saved_alert_views_share_token_idx`: CREATE INDEX saved_alert_views_share_token_idx ON public.saved_alert_views USING btree (share_token)
- `saved_alert_views_share_token_key`: CREATE UNIQUE INDEX saved_alert_views_share_token_key ON public.saved_alert_views USING btree (share_token)
- `saved_alert_views_user_id_idx`: CREATE INDEX saved_alert_views_user_id_idx ON public.saved_alert_views USING btree (user_id)

## security_events

Primary key: none

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | no |  |
| title | text | no |  |
| severity | text | no |  |
| status | text | no |  |
| detected_status | text | no |  |
| source | text | no |  |
| provider | text | yes |  |
| category | text | yes |  |
| timestamp | timestamp with time zone | no |  |
| description | text | yes |  |
| assignee | text | yes |  |
| tactics | _text[] | no |  |
| affected_entities | _text[] | no |  |
| recommended_actions | _text[] | no |  |
| event_code | text | yes |  |
| event_name | text | yes |  |
| actor | text | yes |  |
| resource | text | yes |  |
| ip_address | text | yes |  |
| payload_raw | text | yes |  |
| payload_json | jsonb | yes |  |
| parsed_facts | jsonb | yes |  |
| source_file | text | yes |  |
| summary | text | yes |  |

## severity_distribution

Primary key: `name`

| Column | Type | Nullable | Default |
|---|---|---|---|
| name | text | no |  |
| value | integer | no |  |
| fill | text | no |  |

Indexes:
- `severity_distribution_pkey`: CREATE UNIQUE INDEX severity_distribution_pkey ON public.severity_distribution USING btree (name)

## stg_events

Primary key: none

| Column | Type | Nullable | Default |
|---|---|---|---|
| ingest_run_id | uuid | no |  |
| event_uid | text | no |  |
| source_file | text | no |  |
| source_kind | text | no |  |
| source_row_number | integer | no |  |
| occurred_at | timestamp with time zone | no |  |
| severity | text | no |  |
| status | text | no |  |
| source | text | no |  |
| provider | text | yes |  |
| category | text | yes |  |
| event_code | text | yes |  |
| event_name | text | yes |  |
| actor | text | yes |  |
| resource | text | yes |  |
| ip_address | text | yes |  |
| payload_raw | text | yes |  |
| payload_json | jsonb | yes |  |
| summary | text | yes |  |
| raw_row | jsonb | no |  |
| row_hash | text | no |  |
| title | text | yes |  |
| description | text | yes |  |
| assignee | text | yes |  |
| tactics | _text[] | no | '{}'::text[] |
| affected_entities | _text[] | no | '{}'::text[] |
| recommended_actions | _text[] | no | '{}'::text[] |
| is_alert_candidate | boolean | no | false |
| parsed_facts | jsonb | yes |  |
| type | text | yes |  |

Foreign keys:
- `ingest_run_id` -> `ingest_runs.id`

Indexes:
- `stg_events_alert_candidate_idx`: CREATE INDEX stg_events_alert_candidate_idx ON public.stg_events USING btree (is_alert_candidate)
- `stg_events_occurred_at_idx`: CREATE INDEX stg_events_occurred_at_idx ON public.stg_events USING btree (occurred_at DESC)
- `stg_events_run_uid_idx`: CREATE UNIQUE INDEX stg_events_run_uid_idx ON public.stg_events USING btree (ingest_run_id, event_uid)
- `stg_events_severity_idx`: CREATE INDEX stg_events_severity_idx ON public.stg_events USING btree (severity)
- `stg_events_source_file_idx`: CREATE INDEX stg_events_source_file_idx ON public.stg_events USING btree (source_file)
- `stg_events_type_idx`: CREATE INDEX stg_events_type_idx ON public.stg_events USING btree (type)

## threat_metrics

Primary key: `label`

| Column | Type | Nullable | Default |
|---|---|---|---|
| label | text | no |  |
| value | numeric | no |  |
| change | numeric | no |  |
| change_type | text | no |  |

Indexes:
- `threat_metrics_pkey`: CREATE UNIQUE INDEX threat_metrics_pkey ON public.threat_metrics USING btree (label)
