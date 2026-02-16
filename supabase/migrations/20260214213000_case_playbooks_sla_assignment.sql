alter table public.alert_cases
  add column if not exists alert_type text,
  add column if not exists alert_severity text,
  add column if not exists playbook_key text,
  add column if not exists due_at timestamptz,
  add column if not exists sla_status text not null default 'on_track' check (sla_status in ('on_track', 'at_risk', 'breached')),
  add column if not exists escalation_level int not null default 0,
  add column if not exists escalation_target text check (escalation_target in ('analyst', 'admin')),
  add column if not exists escalated_at timestamptz,
  add column if not exists assignee_user_id uuid references auth.users(id);

create index if not exists alert_cases_due_at_idx on public.alert_cases(due_at);
create index if not exists alert_cases_sla_status_idx on public.alert_cases(sla_status);
create index if not exists alert_cases_assignee_user_id_idx on public.alert_cases(assignee_user_id);
