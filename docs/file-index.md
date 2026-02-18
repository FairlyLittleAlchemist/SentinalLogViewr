# File Index

This index maps each major file area to purpose.

## App Pages (`app/*`)

- `app/page.tsx` - dashboard
- `app/alerts/page.tsx` - alerts triage workspace
- `app/logs/page.tsx` - logs viewer
- `app/recommendations/page.tsx` - recommendation management
- `app/cases/page.tsx` - case list
- `app/cases/[id]/page.tsx` - case workspace
- `app/playbooks/page.tsx` - playbook library/editor (experimental)
- `app/board/page.tsx` - visual investigation board
- `app/chatbot/page.tsx` - chat assistant UI
- `app/account/page.tsx` - profile/security settings
- `app/admin/page.tsx` - admin overview
- `app/admin/users/page.tsx` - role management
- `app/auth/page.tsx` - sign in/recovery
- `app/auth/update-password/page.tsx` - password reset completion
- `app/unauthorized/page.tsx` - authorization failure page

## API Routes (`app/api/*`)

### Alerts
- `app/api/alerts/route.ts`
- `app/api/alerts/[id]/route.ts`
- `app/api/alerts/[id]/correlation/route.ts`

### Logs
- `app/api/logs/route.ts`
- `app/api/logs/sources/route.ts`

### Cases
- `app/api/cases/route.ts`
- `app/api/cases/assignees/route.ts`
- `app/api/cases/[id]/route.ts`
- `app/api/cases/[id]/notes/route.ts`
- `app/api/cases/[id]/tasks/route.ts`
- `app/api/cases/[id]/tasks/[taskId]/route.ts`
- `app/api/cases/[id]/evidence/route.ts`
- `app/api/cases/[id]/alerts/route.ts`
- `app/api/cases/[id]/logs/route.ts`
- `app/api/cases/[id]/hypotheses/route.ts`
- `app/api/cases/[id]/hypotheses/[hypothesisId]/route.ts`
- `app/api/cases/[id]/response-actions/route.ts`
- `app/api/cases/[id]/response-actions/[actionId]/route.ts`
- `app/api/cases/[id]/timeline/route.ts`
- `app/api/cases/[id]/timeline/[eventId]/route.ts`
- `app/api/cases/[id]/graph/route.ts`
- `app/api/cases/[id]/playbook/route.ts`
- `app/api/cases/[id]/playbook/steps/[stepStatusId]/route.ts`

### Boards
- `app/api/boards/route.ts`
- `app/api/boards/[id]/route.ts`
- `app/api/boards/[id]/state/route.ts`

### Other
- `app/api/dashboard/route.ts`
- `app/api/metrics/soc/route.ts`
- `app/api/feature-flags/route.ts`
- `app/api/playbooks/route.ts`
- `app/api/playbooks/[id]/route.ts`
- `app/api/playbooks/[id]/approve/route.ts`
- `app/api/playbooks/[id]/rollback/route.ts`
- `app/api/recommendations/route.ts`
- `app/api/recommendations/[id]/route.ts`
- `app/api/saved-views/route.ts`
- `app/api/saved-views/[id]/route.ts`
- `app/api/chat/route.ts`
- `app/api/auth/signout/route.ts`

## Libraries (`lib/*`)

- `lib/supabase/client.ts` - browser Supabase client
- `lib/supabase/server.ts` - server Supabase client
- `lib/auth/roles.ts` - RBAC role definitions
- `lib/auth/types.ts` - auth/profile types
- `lib/auth/server-role.ts` - server-side user role lookup helpers
- `lib/alerts/normalization.ts` - alert normalization helpers
- `lib/parsing/event-payload.ts` - payload parsing + extracted fields
- `lib/cases/playbooks.ts` - playbook templates
- `lib/cases/sla.ts` - SLA and escalation calculations
- `lib/feature-flags.ts` - feature-flag keys and helpers
- `lib/navigation.ts` - menu model + role visibility
- `lib/utils.ts` - utility helpers
- `lib/data-store.ts` - data access helper layer
- `lib/event-data.ts` - event shaping helpers
- `lib/mock-data.ts` - mock fixtures

## Components (`components/*`)

- `components/dashboard-layout.tsx` - authenticated shell
- `components/app-header.tsx` - top bar
- `components/app-sidebar.tsx` - sidebar/nav
- `components/auth/auth-provider.tsx` - auth context/session
- `components/theme-provider.tsx` - theme provider
- `components/theme-switcher.tsx` - theme toggle
- `components/admin/user-role-table.tsx` - user role admin panel
- `components/dashboard/*` - dashboard widgets
- `components/ui/*` - reusable shadcn primitives

## Scripts (`scripts/*`)

- `scripts/ingest-dashboard-data.cjs` - ETL ingestion/publish
- `scripts/smoke-alert-type-check.cjs` - alert type smoke validation
- `scripts/create-super-admin.cjs` - bootstrap super admin
- `scripts/export-db-schema.cjs` - export live DB schema markdown

## Supabase

- `supabase/config.toml` - local Supabase CLI config
- `supabase/migrations/*.sql` - schema and policy history

## Infra/config

- `middleware.ts` - auth and role gatekeeping
- `tailwind.config.ts`, `postcss.config.mjs`, `next.config.mjs`, `tsconfig.json`
