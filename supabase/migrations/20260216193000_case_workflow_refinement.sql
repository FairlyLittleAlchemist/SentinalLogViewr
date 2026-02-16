alter table public.alert_cases
  add column if not exists workflow_phase text not null default 'triage'
    check (workflow_phase in ('triage', 'investigation', 'containment', 'eradication_recovery', 'post_incident', 'closed')),
  add column if not exists disposition text
    check (disposition in ('true_positive', 'benign_true_positive', 'false_positive', 'duplicate')),
  add column if not exists confidence_score integer not null default 50
    check (confidence_score >= 0 and confidence_score <= 100),
  add column if not exists business_impact text,
  add column if not exists root_cause text,
  add column if not exists containment_summary text,
  add column if not exists recovery_summary text,
  add column if not exists post_incident_summary text,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz;

create index if not exists alert_cases_workflow_phase_idx on public.alert_cases(workflow_phase);
create index if not exists alert_cases_disposition_idx on public.alert_cases(disposition);

create table if not exists public.alert_case_hypotheses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  statement text not null,
  confidence integer not null default 50 check (confidence >= 0 and confidence <= 100),
  status text not null default 'open' check (status in ('open', 'confirmed', 'rejected')),
  evidence_summary text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_case_hypotheses_case_id_idx on public.alert_case_hypotheses(case_id);
create index if not exists alert_case_hypotheses_status_idx on public.alert_case_hypotheses(status);

drop trigger if exists set_alert_case_hypotheses_updated_at on public.alert_case_hypotheses;
create trigger set_alert_case_hypotheses_updated_at
before update on public.alert_case_hypotheses
for each row
execute function public.set_updated_at_column();

create table if not exists public.alert_case_response_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  action_type text not null check (action_type in ('contain_host', 'disable_user', 'block_ip', 'block_domain', 'block_hash', 'revoke_sessions', 'isolate_resource', 'other')),
  target text not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'failed', 'cancelled')),
  details text,
  executed_by uuid references auth.users(id),
  executed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_case_response_actions_case_id_idx on public.alert_case_response_actions(case_id);
create index if not exists alert_case_response_actions_status_idx on public.alert_case_response_actions(status);

drop trigger if exists set_alert_case_response_actions_updated_at on public.alert_case_response_actions;
create trigger set_alert_case_response_actions_updated_at
before update on public.alert_case_response_actions
for each row
execute function public.set_updated_at_column();

create table if not exists public.alert_case_timeline_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  event_type text not null check (event_type in ('first_seen', 'detection', 'triage', 'containment', 'eradication', 'recovery', 'post_incident', 'custom')),
  title text not null,
  event_at timestamptz not null,
  details text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_case_timeline_events_case_id_idx on public.alert_case_timeline_events(case_id);
create index if not exists alert_case_timeline_events_event_at_idx on public.alert_case_timeline_events(event_at);

drop trigger if exists set_alert_case_timeline_events_updated_at on public.alert_case_timeline_events;
create trigger set_alert_case_timeline_events_updated_at
before update on public.alert_case_timeline_events
for each row
execute function public.set_updated_at_column();

alter table public.alert_case_hypotheses enable row level security;
alter table public.alert_case_response_actions enable row level security;
alter table public.alert_case_timeline_events enable row level security;

drop policy if exists "alert_case_hypotheses_read_authenticated" on public.alert_case_hypotheses;
create policy "alert_case_hypotheses_read_authenticated"
on public.alert_case_hypotheses
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_hypotheses_write_admin_analyst" on public.alert_case_hypotheses;
create policy "alert_case_hypotheses_write_admin_analyst"
on public.alert_case_hypotheses
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "alert_case_response_actions_read_authenticated" on public.alert_case_response_actions;
create policy "alert_case_response_actions_read_authenticated"
on public.alert_case_response_actions
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_response_actions_write_admin_analyst" on public.alert_case_response_actions;
create policy "alert_case_response_actions_write_admin_analyst"
on public.alert_case_response_actions
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "alert_case_timeline_events_read_authenticated" on public.alert_case_timeline_events;
create policy "alert_case_timeline_events_read_authenticated"
on public.alert_case_timeline_events
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_timeline_events_write_admin_analyst" on public.alert_case_timeline_events;
create policy "alert_case_timeline_events_write_admin_analyst"
on public.alert_case_timeline_events
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

