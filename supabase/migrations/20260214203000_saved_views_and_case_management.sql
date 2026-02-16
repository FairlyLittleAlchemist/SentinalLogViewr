create extension if not exists pgcrypto;

create table if not exists public.saved_alert_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_alert_views_user_id_idx on public.saved_alert_views(user_id);
create index if not exists saved_alert_views_share_token_idx on public.saved_alert_views(share_token);

alter table public.saved_alert_views enable row level security;

drop policy if exists "saved_alert_views_read_own_or_shared" on public.saved_alert_views;
create policy "saved_alert_views_read_own_or_shared"
on public.saved_alert_views
for select
using (auth.uid() = user_id or is_shared = true);

drop policy if exists "saved_alert_views_write_own" on public.saved_alert_views;
create policy "saved_alert_views_write_own"
on public.saved_alert_views
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.alert_cases (
  id uuid primary key default gen_random_uuid(),
  alert_id text not null references public.alerts(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  assignee text,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_cases_alert_id_idx on public.alert_cases(alert_id);
create index if not exists alert_cases_status_idx on public.alert_cases(status);
create index if not exists alert_cases_created_at_idx on public.alert_cases(created_at desc);

create table if not exists public.alert_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  body text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists alert_case_notes_case_id_idx on public.alert_case_notes(case_id);

create table if not exists public.alert_case_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  due_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_case_tasks_case_id_idx on public.alert_case_tasks(case_id);
create index if not exists alert_case_tasks_done_idx on public.alert_case_tasks(is_done);

create table if not exists public.alert_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  label text not null,
  evidence_type text not null default 'link' check (evidence_type in ('link', 'file', 'hash', 'ioc', 'note')),
  url text,
  details text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists alert_case_evidence_case_id_idx on public.alert_case_evidence(case_id);

create table if not exists public.alert_case_activity (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists alert_case_activity_case_id_idx on public.alert_case_activity(case_id);
create index if not exists alert_case_activity_created_at_idx on public.alert_case_activity(created_at desc);

create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_saved_alert_views_updated_at on public.saved_alert_views;
create trigger set_saved_alert_views_updated_at
before update on public.saved_alert_views
for each row
execute function public.set_updated_at_column();

drop trigger if exists set_alert_cases_updated_at on public.alert_cases;
create trigger set_alert_cases_updated_at
before update on public.alert_cases
for each row
execute function public.set_updated_at_column();

drop trigger if exists set_alert_case_tasks_updated_at on public.alert_case_tasks;
create trigger set_alert_case_tasks_updated_at
before update on public.alert_case_tasks
for each row
execute function public.set_updated_at_column();

alter table public.alert_cases enable row level security;
alter table public.alert_case_notes enable row level security;
alter table public.alert_case_tasks enable row level security;
alter table public.alert_case_evidence enable row level security;
alter table public.alert_case_activity enable row level security;

drop policy if exists "alert_cases_read_authenticated" on public.alert_cases;
create policy "alert_cases_read_authenticated"
on public.alert_cases
for select
using (auth.uid() is not null);

drop policy if exists "alert_cases_write_admin_analyst" on public.alert_cases;
create policy "alert_cases_write_admin_analyst"
on public.alert_cases
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "alert_case_notes_read_authenticated" on public.alert_case_notes;
create policy "alert_case_notes_read_authenticated"
on public.alert_case_notes
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_notes_write_admin_analyst" on public.alert_case_notes;
create policy "alert_case_notes_write_admin_analyst"
on public.alert_case_notes
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "alert_case_tasks_read_authenticated" on public.alert_case_tasks;
create policy "alert_case_tasks_read_authenticated"
on public.alert_case_tasks
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_tasks_write_admin_analyst" on public.alert_case_tasks;
create policy "alert_case_tasks_write_admin_analyst"
on public.alert_case_tasks
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "alert_case_evidence_read_authenticated" on public.alert_case_evidence;
create policy "alert_case_evidence_read_authenticated"
on public.alert_case_evidence
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_evidence_write_admin_analyst" on public.alert_case_evidence;
create policy "alert_case_evidence_write_admin_analyst"
on public.alert_case_evidence
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "alert_case_activity_read_authenticated" on public.alert_case_activity;
create policy "alert_case_activity_read_authenticated"
on public.alert_case_activity
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_activity_write_admin_analyst" on public.alert_case_activity;
create policy "alert_case_activity_write_admin_analyst"
on public.alert_case_activity
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));
