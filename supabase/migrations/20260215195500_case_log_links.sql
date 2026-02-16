create table if not exists public.alert_case_logs (
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  log_id text not null references public.logs(id) on delete cascade,
  relation_type text not null default 'related_to' check (relation_type in ('related_to', 'same_actor', 'same_ip', 'same_resource')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (case_id, log_id)
);

create index if not exists alert_case_logs_case_id_idx on public.alert_case_logs(case_id);
create index if not exists alert_case_logs_log_id_idx on public.alert_case_logs(log_id);
create index if not exists alert_case_logs_created_at_idx on public.alert_case_logs(created_at desc);

alter table public.alert_case_logs enable row level security;

drop policy if exists "alert_case_logs_read_authenticated" on public.alert_case_logs;
create policy "alert_case_logs_read_authenticated"
on public.alert_case_logs
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_logs_write_admin_analyst" on public.alert_case_logs;
create policy "alert_case_logs_write_admin_analyst"
on public.alert_case_logs
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

