# Sentinel Azure Logs - Project Documentation

Last updated: 2026-02-16

## 1) What this project is

This is a Next.js + Supabase SOC dashboard for:
- ingesting CSV security telemetry,
- normalizing events into alerts/logs,
- triaging incidents,
- running case management,
- building investigation boards (visual graph of alerts/logs/evidence),
- and enforcing RBAC (admin/analyst/viewer).

## 2) Stack and runtime

- Frontend/App: Next.js App Router, React, TypeScript, Tailwind
- UI kit: shadcn/ui components under `components/ui`
- Data/Auth: Supabase (Postgres + Auth + RLS)
- Graph board: `@xyflow/react` + `dagre`
- ETL scripts: Node `.cjs` scripts under `scripts/`

## 3) Core SOC workflow implemented

1. Ingest telemetry CSVs -> stage in `stg_events` -> publish alerts/logs.
2. Analysts triage alerts/logs in app and set analyst override state.
3. Create a case from alert (primary alert link auto-created).
4. Investigate in case workspace:
   - notes/tasks/evidence,
   - related alerts/logs linking,
   - hypotheses,
   - response actions,
   - timeline milestones.
5. Update SOC workflow metadata (phase, disposition, confidence, impact, root cause, containment/recovery/post-incident summaries).
6. Open case in board (`/board?caseId=...&seed=1`) and map relationships visually.
7. Resolve/close with server-side closure gates and full activity trail.

## 4) UI routes

- `/` dashboard
- `/alerts` alert management + details + correlation + case drawer actions
- `/logs` log viewer
- `/recommendations` remediation recommendations
- `/cases` case list
- `/cases/[id]` full case workspace
- `/playbooks` playbook library/editor (experimental flag-gated)
- `/board` investigation board
- `/chatbot` AI assistant
- `/account` account settings
- `/admin` and `/admin/users` admin controls
- `/auth`, `/auth/callback`, `/auth/update-password` auth flow
- `/unauthorized` access control fallback

## 5) API routes

### Auth and profile
- `app/api/auth/signout/route.ts` - server-side signout endpoint

### Dashboard/alerts/logs/recommendations
- `app/api/dashboard/route.ts` - dashboard metrics/charts
- `app/api/alerts/route.ts` - alerts list/filter/search + parsed payload metadata
- `app/api/alerts/[id]/route.ts` - get/update single alert (status/assignee overrides)
- `app/api/alerts/[id]/correlation/route.ts` - related alerts by shared context
- `app/api/logs/route.ts` - logs list/filter/search
- `app/api/logs/sources/route.ts` - source aggregation for logs
- `app/api/recommendations/route.ts` - recommendation list
- `app/api/recommendations/[id]/route.ts` - recommendation update

### Cases
- `app/api/cases/route.ts` - list/create cases
- `app/api/cases/assignees/route.ts` - assignee lookup/workload
- `app/api/cases/[id]/route.ts` - case detail + update
- `app/api/cases/[id]/notes/route.ts` - add note
- `app/api/cases/[id]/tasks/route.ts` - add task
- `app/api/cases/[id]/tasks/[taskId]/route.ts` - update task
- `app/api/cases/[id]/evidence/route.ts` - add evidence
- `app/api/cases/[id]/alerts/route.ts` - link/unlink alerts to case
- `app/api/cases/[id]/logs/route.ts` - link/unlink logs to case
- `app/api/cases/[id]/hypotheses/route.ts` - add case hypothesis
- `app/api/cases/[id]/hypotheses/[hypothesisId]/route.ts` - update hypothesis
- `app/api/cases/[id]/response-actions/route.ts` - add response action
- `app/api/cases/[id]/response-actions/[actionId]/route.ts` - update response action
- `app/api/cases/[id]/timeline/route.ts` - add timeline event
- `app/api/cases/[id]/timeline/[eventId]/route.ts` - update timeline event
- `app/api/cases/[id]/graph/route.ts` - build board seed graph for a case
- `app/api/cases/[id]/playbook/route.ts` - bind/reseed case playbook execution + progress
- `app/api/cases/[id]/playbook/steps/[stepStatusId]/route.ts` - update playbook step status

### Boards
- `app/api/boards/route.ts` - list/create boards
- `app/api/boards/[id]/route.ts` - board read/update/delete
- `app/api/boards/[id]/state/route.ts` - persist full node/edge/viewport state

### Playbooks/feature flags/metrics
- `app/api/feature-flags/route.ts` - list/update feature flags (admin writes)
- `app/api/playbooks/route.ts` - playbook list/create
- `app/api/playbooks/[id]/route.ts` - playbook detail/update/delete(deactivate fallback)
- `app/api/playbooks/[id]/approve/route.ts` - approve/promote playbook version
- `app/api/playbooks/[id]/rollback/route.ts` - rollback current version
- `app/api/metrics/soc/route.ts` - SOC KPI endpoint (MTTA/MTTR/reopen/false-positive/SLA/workload)

### Saved views and chat
- `app/api/saved-views/route.ts` - list/create saved alert views
- `app/api/saved-views/[id]/route.ts` - update/delete saved view
- `app/api/chat/route.ts` - AI chat endpoint

## 6) Database schema (public)

### Ingestion and normalized SIEM data
- `ingest_runs` - ingest run tracking
- `stg_events` - staged normalized events (raw + parsed payload)
- `alerts` - published actionable alerts
- `logs` - published logs/events
- `incidents`, `security_events`, `activity_events`, `firewall_events` - typed alert projections
- `alert_overrides` - analyst status/assignee overrides

### Dashboard/analytics tables
- `threat_metrics`, `alert_time_series`, `severity_distribution`, `attack_sources`

### Cases
- `alert_cases` - main case entity (status, priority, SLA, escalation, assignee)
- `alert_case_notes` - notes
- `alert_case_tasks` - tasks
- `alert_case_evidence` - evidence artifacts
- `alert_case_activity` - audit/activity events
- `alert_case_alerts` - many-to-many case <-> alerts links (+ relation type)
- `alert_case_logs` - many-to-many case <-> logs links (+ relation type)
- `case_playbook_executions` - case-playbook binding + strict-mode execution state
- `case_playbook_step_status` - per-step execution status

### Playbooks/feature flags
- `feature_flags` - admin-managed experimental toggles
- `playbook_templates` - playbook template metadata + current version pointer
- `playbook_template_versions` - version history + approval metadata
- `playbook_template_steps` - ordered stage-gated steps per version
- `alert_case_hypotheses` - investigation hypotheses and confidence
- `alert_case_response_actions` - containment/response action tracking
- `alert_case_timeline_events` - investigation timeline milestones

### Boards
- `investigation_boards` - board metadata, owner, optional `case_id`, viewport
- `investigation_board_nodes` - board nodes
- `investigation_board_edges` - board edges

### Auth/profile and preferences
- `profiles` - user profile + role
- `saved_alert_views` - user saved alert filters/views
- `recommendations` - recommendation records

### Key foreign keys
- `stg_events.ingest_run_id -> ingest_runs.id`
- `alert_cases.alert_id -> alerts.id`
- `alert_case_alerts.case_id -> alert_cases.id`
- `alert_case_alerts.alert_id -> alerts.id`
- `alert_case_logs.case_id -> alert_cases.id`
- `alert_case_logs.log_id -> logs.id`
- `alert_case_notes/tasks/evidence/activity.case_id -> alert_cases.id`
- `alert_overrides.alert_id -> alerts.id`
- `investigation_boards.case_id -> alert_cases.id`
- `investigation_board_nodes/edges.board_id -> investigation_boards.id`

### Security model
- RLS enabled across operational tables.
- Read access for authenticated users where required.
- Write paths mostly restricted to admin/analyst via role checks (`has_role(...)`).

## 7) Migrations (chronological intent)

- `20260206110000_create_profiles.sql` - profile table + auth trigger/policies
- `20260206123000_fix_profiles_policies.sql` - policy hardening
- `20260206130000_mock_data_to_db.sql` - seed/mock SIEM base tables/policies
- `20260213150000_etl_schema_upgrade.sql` - ETL schema upgrade
- `20260213170000_etl_v2_two_layer.sql` - staged->published two-layer model
- `20260213210000_parsed_facts_and_finalize.sql` - parsed facts + finalize behavior
- `20260213213000_finalize_chunked.sql` - chunked publish/finalize
- `20260214090000_type_safe_siem.sql` - type safety improvements
- `20260214113000_backfill_alert_types.sql` - alert type backfill
- `20260214203000_saved_views_and_case_management.sql` - saved views + base case module
- `20260214213000_case_playbooks_sla_assignment.sql` - playbooks, SLA, assignment/escalation
- `20260214230000_investigation_boards.sql` - board tables + policies
- `20260215193000_case_alert_links.sql` - many-to-many case-alert links
- `20260215195500_case_log_links.sql` - many-to-many case-log links
- `20260216193000_case_workflow_refinement.sql` - workflow phase/disposition + hypotheses/actions/timeline
- `20260216230000_playbooks_feature_flags_and_execution.sql` - feature flags + playbook templates/versioning/execution
- `20260216193000_case_workflow_refinement.sql` - workflow phase fields + hypotheses/actions/timeline tables

## 8) File-by-file reference

### Root/config files
- `package.json` - scripts and dependencies
- `package-lock.json` - npm lockfile
- `pnpm-lock.yaml` - pnpm lockfile
- `next.config.mjs` - Next.js config
- `tailwind.config.ts` - Tailwind theme/config
- `postcss.config.mjs` - PostCSS config
- `tsconfig.json` - TypeScript compiler options
- `tsconfig.tsbuildinfo` - TS incremental build artifact
- `next-env.d.ts` - Next TypeScript ambient types
- `components.json` - shadcn/ui config
- `middleware.ts` - auth/role enforcement + Supabase reachability guard

### Public/static assets
- `public/placeholder.svg` - generic placeholder asset
- `public/placeholder-logo.svg` - placeholder logo asset

### Global styles
- `styles/globals.css` - legacy/global style entry
- `app/globals.css` - app-level global styles

### Hooks
- `hooks/use-mobile.tsx` - responsive mobile helper hook
- `hooks/use-toast.ts` - toast utility hook

### Shared libs
- `lib/utils.ts` - shared utility helpers (`cn`, misc)
- `lib/navigation.ts` - app navigation definitions and role visibility
- `lib/data-store.ts` - data access helper layer
- `lib/event-data.ts` - event shaping/helper logic
- `lib/mock-data.ts` - mock dataset fallback/fixtures
- `lib/alerts/normalization.ts` - alert assignee/summary normalization helpers
- `lib/parsing/event-payload.ts` - payload parsing/flattening/facts extraction

### Auth libs
- `lib/auth/roles.ts` - role constants/labels and defaults
- `lib/auth/types.ts` - auth/profile TS types

### Cases libs
- `lib/cases/playbooks.ts` - case playbook templates/tasks
- `lib/cases/sla.ts` - SLA due date, breach risk, escalation calculations

### Supabase client libs
- `lib/supabase/client.ts` - browser Supabase client factory
- `lib/supabase/server.ts` - server Supabase client factory with cookies

### Type declarations
- `types/logfmt.d.ts` - typing shim for `logfmt`

### Scripts
- `scripts/ingest-dashboard-data.cjs` - ETL v2 CSV ingest + publish finalize
- `scripts/smoke-alert-type-check.cjs` - smoke test for alert type separation
- `scripts/create-super-admin.cjs` - create/promote super admin user profile

### App shell and providers
- `app/layout.tsx` - root app layout/providers
- `components/dashboard-layout.tsx` - authenticated app frame
- `components/auth/auth-provider.tsx` - client auth context/session handling
- `components/theme-provider.tsx` - theme context provider
- `components/theme-switcher.tsx` - theme toggle UI
- `components/app-header.tsx` - top navigation/header
- `components/app-sidebar.tsx` - left sidebar + nav + sign out

### Pages
- `app/page.tsx` - dashboard page
- `app/alerts/page.tsx` - full alerts UI + details/correlation/case actions
- `app/logs/page.tsx` - logs viewer UI
- `app/recommendations/page.tsx` - recommendations UI
- `app/cases/page.tsx` - cases list UI
- `app/cases/[id]/page.tsx` - case workspace (alerts/logs links, tasks, notes, activity, board entry)
- `app/board/page.tsx` - investigation board UI (drag/drop, context menu, save, case bootstrap)
- `app/chatbot/page.tsx` - assistant/chat UI
- `app/account/page.tsx` - user profile/password settings
- `app/admin/page.tsx` - admin dashboard
- `app/admin/users/page.tsx` - user/role management
- `app/auth/page.tsx` - login/recovery UI
- `app/auth/update-password/page.tsx` - password reset completion
- `app/unauthorized/page.tsx` - unauthorized access page

### Auth callback route
- `app/auth/callback/route.ts` - OAuth/recovery callback handling and redirects

### API routes
- `app/api/auth/signout/route.ts` - server signout
- `app/api/chat/route.ts` - AI chat backend endpoint
- `app/api/dashboard/route.ts` - dashboard aggregates
- `app/api/alerts/route.ts` - alerts list/filter/search
- `app/api/alerts/[id]/route.ts` - alert get/patch
- `app/api/alerts/[id]/correlation/route.ts` - alert correlation
- `app/api/logs/route.ts` - logs list/search
- `app/api/logs/sources/route.ts` - logs sources summary
- `app/api/recommendations/route.ts` - recommendations list
- `app/api/recommendations/[id]/route.ts` - recommendation update
- `app/api/saved-views/route.ts` - saved views list/create
- `app/api/saved-views/[id]/route.ts` - saved view update/delete
- `app/api/cases/route.ts` - cases list/create
- `app/api/cases/assignees/route.ts` - assignee directory/workload
- `app/api/cases/[id]/route.ts` - case detail/update
- `app/api/cases/[id]/notes/route.ts` - add note
- `app/api/cases/[id]/tasks/route.ts` - add task
- `app/api/cases/[id]/tasks/[taskId]/route.ts` - patch task
- `app/api/cases/[id]/evidence/route.ts` - add evidence
- `app/api/cases/[id]/alerts/route.ts` - case-alert links
- `app/api/cases/[id]/logs/route.ts` - case-log links
- `app/api/cases/[id]/hypotheses/route.ts` - case hypotheses create
- `app/api/cases/[id]/hypotheses/[hypothesisId]/route.ts` - case hypotheses update
- `app/api/cases/[id]/response-actions/route.ts` - response actions create
- `app/api/cases/[id]/response-actions/[actionId]/route.ts` - response actions update
- `app/api/cases/[id]/timeline/route.ts` - timeline events create
- `app/api/cases/[id]/timeline/[eventId]/route.ts` - timeline events update
- `app/api/cases/[id]/graph/route.ts` - build case graph for board seeding
- `app/api/boards/route.ts` - boards list/create
- `app/api/boards/[id]/route.ts` - board get/update/delete
- `app/api/boards/[id]/state/route.ts` - board state persist

### Admin components
- `components/admin/user-role-table.tsx` - user role assignment table

### Dashboard widgets
- `components/dashboard/metric-cards.tsx` - KPI cards
- `components/dashboard/alerts-chart.tsx` - alerts trend chart
- `components/dashboard/severity-chart.tsx` - severity distribution chart
- `components/dashboard/attack-sources.tsx` - top attack/source panel
- `components/dashboard/recent-alerts.tsx` - latest alerts panel

### UI primitives (`components/ui/*`)
These are reusable shadcn/ui primitives used across the app. They provide styling/behavior only; domain logic lives in pages/api/lib.

- `accordion.tsx`, `alert.tsx`, `alert-dialog.tsx`, `aspect-ratio.tsx`, `avatar.tsx`, `badge.tsx`, `breadcrumb.tsx`, `button.tsx`, `calendar.tsx`, `card.tsx`, `carousel.tsx`, `chart.tsx`, `checkbox.tsx`, `collapsible.tsx`, `command.tsx`, `context-menu.tsx`, `dialog.tsx`, `drawer.tsx`, `dropdown-menu.tsx`, `form.tsx`, `hover-card.tsx`, `input.tsx`, `input-otp.tsx`, `label.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`, `popover.tsx`, `progress.tsx`, `radio-group.tsx`, `resizable.tsx`, `scroll-area.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `sidebar.tsx`, `skeleton.tsx`, `slider.tsx`, `sonner.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `toast.tsx`, `toaster.tsx`, `toggle.tsx`, `toggle-group.tsx`, `tooltip.tsx`, `use-mobile.tsx`, `use-toast.ts`.

### Supabase
- `supabase/config.toml` - local Supabase CLI/service config
- `supabase/migrations/*.sql` - full schema evolution and policy logic

## 9) Operational notes

- For ingest performance and correctness, use:
  - `node scripts/ingest-dashboard-data.cjs`
  - `npm run smoke:alerts`
- Local Supabase status:
  - `npx supabase status`
- Apply migrations locally:
  - `npx supabase migration up --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`

## 10) Suggested next documentation split (optional)

If this single document gets too big, split into:
- `docs/architecture.md`
- `docs/api.md`
- `docs/database.md`
- `docs/file-index.md`
- `docs/database-schema-full.md` (generated from live DB)
- `docs/database-er-diagram.md` (Mermaid ER diagram)
