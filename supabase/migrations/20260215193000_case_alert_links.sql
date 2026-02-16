create table if not exists public.alert_case_alerts (
  case_id uuid not null references public.alert_cases(id) on delete cascade,
  alert_id text not null references public.alerts(id) on delete cascade,
  relation_type text not null default 'related_to' check (relation_type in ('primary', 'related_to', 'same_actor', 'same_ip', 'same_resource')),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (case_id, alert_id)
);

create index if not exists alert_case_alerts_alert_id_idx on public.alert_case_alerts(alert_id);
create index if not exists alert_case_alerts_case_id_idx on public.alert_case_alerts(case_id);
create index if not exists alert_case_alerts_created_at_idx on public.alert_case_alerts(created_at desc);

insert into public.alert_case_alerts (case_id, alert_id, relation_type, is_primary, created_by)
select c.id, c.alert_id, 'primary', true, c.created_by
from public.alert_cases c
left join public.alert_case_alerts links
  on links.case_id = c.id
 and links.alert_id = c.alert_id
where links.case_id is null;

alter table public.alert_case_alerts enable row level security;

drop policy if exists "alert_case_alerts_read_authenticated" on public.alert_case_alerts;
create policy "alert_case_alerts_read_authenticated"
on public.alert_case_alerts
for select
using (auth.uid() is not null);

drop policy if exists "alert_case_alerts_write_admin_analyst" on public.alert_case_alerts;
create policy "alert_case_alerts_write_admin_analyst"
on public.alert_case_alerts
for all
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

