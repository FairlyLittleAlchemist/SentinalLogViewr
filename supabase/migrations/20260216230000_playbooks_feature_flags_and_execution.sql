create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, description)
values ('experimental_playbooks', false, 'Enables playbook library and execution UX')
on conflict (key) do nothing;

create table if not exists public.playbook_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  alert_type text,
  severity text,
  sla_target_minutes integer not null default 240 check (sla_target_minutes > 0),
  strict_mode boolean not null default false,
  is_active boolean not null default true,
  current_version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playbook_templates_active_idx on public.playbook_templates(is_active);
create index if not exists playbook_templates_alert_type_idx on public.playbook_templates(alert_type);

drop trigger if exists set_playbook_templates_updated_at on public.playbook_templates;
create trigger set_playbook_templates_updated_at
before update on public.playbook_templates
for each row
execute function public.set_updated_at_column();

create table if not exists public.playbook_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.playbook_templates(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  change_notes text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(template_id, version)
);

create index if not exists playbook_template_versions_template_idx on public.playbook_template_versions(template_id);
create index if not exists playbook_template_versions_status_idx on public.playbook_template_versions(status);

create table if not exists public.playbook_template_steps (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.playbook_template_versions(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  title text not null,
  details text,
  stage text not null check (stage in ('triage', 'investigation', 'containment', 'eradication_recovery', 'post_incident')),
  required boolean not null default true,
  expected_minutes integer check (expected_minutes is null or expected_minutes > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(version_id, step_order)
);

create index if not exists playbook_template_steps_version_idx on public.playbook_template_steps(version_id);
create index if not exists playbook_template_steps_stage_idx on public.playbook_template_steps(stage);

create table if not exists public.case_playbook_executions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.alert_cases(id) on delete cascade,
  template_id uuid not null references public.playbook_templates(id) on delete restrict,
  version_id uuid not null references public.playbook_template_versions(id) on delete restrict,
  strict_mode boolean not null default false,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  started_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists case_playbook_executions_template_idx on public.case_playbook_executions(template_id);
create index if not exists case_playbook_executions_status_idx on public.case_playbook_executions(status);

create table if not exists public.case_playbook_step_status (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.case_playbook_executions(id) on delete cascade,
  step_id uuid not null references public.playbook_template_steps(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
  notes text,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(execution_id, step_id)
);

create index if not exists case_playbook_step_status_execution_idx on public.case_playbook_step_status(execution_id);
create index if not exists case_playbook_step_status_status_idx on public.case_playbook_step_status(status);

drop trigger if exists set_case_playbook_step_status_updated_at on public.case_playbook_step_status;
create trigger set_case_playbook_step_status_updated_at
before update on public.case_playbook_step_status
for each row
execute function public.set_updated_at_column();

alter table public.alert_case_evidence
  add column if not exists file_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists content_type text,
  add column if not exists sha256 text;

alter table public.feature_flags enable row level security;
alter table public.playbook_templates enable row level security;
alter table public.playbook_template_versions enable row level security;
alter table public.playbook_template_steps enable row level security;
alter table public.case_playbook_executions enable row level security;
alter table public.case_playbook_step_status enable row level security;

drop policy if exists "feature_flags_read_authenticated" on public.feature_flags;
create policy "feature_flags_read_authenticated"
on public.feature_flags
for select
using (auth.uid() is not null);

drop policy if exists "feature_flags_admin_write" on public.feature_flags;
create policy "feature_flags_admin_write"
on public.feature_flags
for all
using (public.has_role(array['admin']))
with check (public.has_role(array['admin']));

drop policy if exists "playbook_templates_read_authenticated" on public.playbook_templates;
create policy "playbook_templates_read_authenticated"
on public.playbook_templates
for select
using (auth.uid() is not null);

drop policy if exists "playbook_templates_admin_write" on public.playbook_templates;
create policy "playbook_templates_admin_write"
on public.playbook_templates
for all
using (public.has_role(array['admin']))
with check (public.has_role(array['admin']));

drop policy if exists "playbook_template_versions_read_authenticated" on public.playbook_template_versions;
create policy "playbook_template_versions_read_authenticated"
on public.playbook_template_versions
for select
using (auth.uid() is not null);

drop policy if exists "playbook_template_versions_admin_write" on public.playbook_template_versions;
create policy "playbook_template_versions_admin_write"
on public.playbook_template_versions
for all
using (public.has_role(array['admin']))
with check (public.has_role(array['admin']));

drop policy if exists "playbook_template_steps_read_authenticated" on public.playbook_template_steps;
create policy "playbook_template_steps_read_authenticated"
on public.playbook_template_steps
for select
using (auth.uid() is not null);

drop policy if exists "playbook_template_steps_admin_write" on public.playbook_template_steps;
create policy "playbook_template_steps_admin_write"
on public.playbook_template_steps
for all
using (public.has_role(array['admin']))
with check (public.has_role(array['admin']));

drop policy if exists "case_playbook_executions_read_authenticated" on public.case_playbook_executions;
create policy "case_playbook_executions_read_authenticated"
on public.case_playbook_executions
for select
using (auth.uid() is not null);

drop policy if exists "case_playbook_executions_admin_analyst_write" on public.case_playbook_executions;
create policy "case_playbook_executions_admin_analyst_write"
on public.case_playbook_executions
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "case_playbook_step_status_read_authenticated" on public.case_playbook_step_status;
create policy "case_playbook_step_status_read_authenticated"
on public.case_playbook_step_status
for select
using (auth.uid() is not null);

drop policy if exists "case_playbook_step_status_admin_analyst_write" on public.case_playbook_step_status;
create policy "case_playbook_step_status_admin_analyst_write"
on public.case_playbook_step_status
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

with upserted as (
  insert into public.playbook_templates (key, name, description, alert_type, sla_target_minutes, strict_mode, is_active)
  values
    ('incident_response', 'Incident Response', 'Core incident handling flow for high impact detections.', 'incident', 240, true, true),
    ('security_event_triage', 'Security Event Triage', 'Signal validation and escalation flow.', 'security_event', 180, false, true),
    ('activity_investigation', 'Activity Investigation', 'Suspicious activity investigation flow.', 'activity', 300, false, true),
    ('network_containment', 'Network Containment', 'Network-focused containment and recovery flow.', 'firewall', 120, true, true)
  on conflict (key) do update
    set name = excluded.name,
        description = excluded.description,
        alert_type = excluded.alert_type,
        sla_target_minutes = excluded.sla_target_minutes
  returning id, key
), ensure_versions as (
  insert into public.playbook_template_versions (template_id, version, status)
  select u.id, 1, 'approved'
  from upserted u
  where not exists (
    select 1 from public.playbook_template_versions v
    where v.template_id = u.id and v.version = 1
  )
  returning template_id, id
), version_rows as (
  select v.template_id, v.id as version_id
  from public.playbook_template_versions v
  join upserted u on u.id = v.template_id
  where v.version = 1
)
insert into public.playbook_template_steps (version_id, step_order, title, stage, required)
select vr.version_id, s.step_order, s.title, s.stage, s.required
from version_rows vr
join upserted u on u.id = vr.template_id
join (
  values
    ('incident_response', 1, 'Validate incident scope and impact', 'triage', true),
    ('incident_response', 2, 'Confirm affected accounts, hosts, and resources', 'investigation', true),
    ('incident_response', 3, 'Contain active threat paths', 'containment', true),
    ('incident_response', 4, 'Document root cause and post-incident actions', 'post_incident', true),
    ('security_event_triage', 1, 'Verify signal fidelity and source integrity', 'triage', true),
    ('security_event_triage', 2, 'Correlate event with recent related alerts', 'investigation', true),
    ('security_event_triage', 3, 'Classify as benign, suspicious, or malicious', 'investigation', true),
    ('security_event_triage', 4, 'Escalate confirmed threats to incident workflow', 'containment', false),
    ('activity_investigation', 1, 'Validate actor intent and change context', 'triage', true),
    ('activity_investigation', 2, 'Review access scope and privilege level', 'investigation', true),
    ('activity_investigation', 3, 'Check unusual geo/time/resource behavior', 'investigation', true),
    ('activity_investigation', 4, 'Capture policy impact and closeout notes', 'post_incident', false),
    ('network_containment', 1, 'Identify source and destination path', 'triage', true),
    ('network_containment', 2, 'Validate protocol and port risk profile', 'investigation', true),
    ('network_containment', 3, 'Block or restrict suspicious indicators', 'containment', true),
    ('network_containment', 4, 'Verify post-block behavior and recovery', 'eradication_recovery', true)
) as s(template_key, step_order, title, stage, required)
on u.key = s.template_key
where not exists (
  select 1 from public.playbook_template_steps existing
  where existing.version_id = vr.version_id and existing.step_order = s.step_order
);
