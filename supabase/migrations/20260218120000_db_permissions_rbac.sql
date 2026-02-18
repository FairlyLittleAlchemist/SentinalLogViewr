create table if not exists public.permissions (
  key text primary key,
  domain text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role text not null check (role in ('admin', 'analyst', 'viewer')),
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_key)
);

create table if not exists public.user_permission_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  primary key (user_id, permission_key)
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;

drop policy if exists "permissions_read_authenticated" on public.permissions;
create policy "permissions_read_authenticated"
on public.permissions
for select
using (auth.uid() is not null);

drop policy if exists "permissions_admin_write" on public.permissions;
create policy "permissions_admin_write"
on public.permissions
for all
using (public.has_role(array['admin']))
with check (public.has_role(array['admin']));

drop policy if exists "role_permissions_read_authenticated" on public.role_permissions;
create policy "role_permissions_read_authenticated"
on public.role_permissions
for select
using (auth.uid() is not null);

drop policy if exists "role_permissions_admin_write" on public.role_permissions;
create policy "role_permissions_admin_write"
on public.role_permissions
for all
using (public.has_role(array['admin']))
with check (public.has_role(array['admin']));

drop policy if exists "user_permission_overrides_self_read" on public.user_permission_overrides;
create policy "user_permission_overrides_self_read"
on public.user_permission_overrides
for select
using (auth.uid() = user_id or public.has_role(array['admin']));

drop policy if exists "user_permission_overrides_admin_write" on public.user_permission_overrides;
create policy "user_permission_overrides_admin_write"
on public.user_permission_overrides
for all
using (public.has_role(array['admin']))
with check (public.has_role(array['admin']));

create or replace function public.current_permissions()
returns table(permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  with current_role as (
    select lower(p.role) as role
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ),
  role_grants as (
    select rp.permission_key
    from public.role_permissions rp
    join current_role cr on cr.role = rp.role
  ),
  user_allows as (
    select uo.permission_key
    from public.user_permission_overrides uo
    where uo.user_id = auth.uid()
      and uo.effect = 'allow'
  ),
  user_denies as (
    select uo.permission_key
    from public.user_permission_overrides uo
    where uo.user_id = auth.uid()
      and uo.effect = 'deny'
  ),
  merged as (
    select permission_key from role_grants
    union
    select permission_key from user_allows
  )
  select m.permission_key
  from merged m
  where not exists (
    select 1
    from user_denies d
    where d.permission_key = m.permission_key
  );
$$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.current_permissions() cp
    where cp.permission_key = p_permission
  );
$$;

grant execute on function public.current_permissions() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

insert into public.permissions (key, domain, action, description)
values
  ('dashboard.read', 'dashboard', 'read', 'View dashboard metrics'),
  ('alerts.read', 'alerts', 'read', 'View alerts'),
  ('alerts.update', 'alerts', 'update', 'Update alert triage fields'),
  ('logs.read', 'logs', 'read', 'View logs'),
  ('recommendations.read', 'recommendations', 'read', 'View recommendations'),
  ('cases.read', 'cases', 'read', 'View cases'),
  ('cases.create', 'cases', 'create', 'Create cases'),
  ('cases.update', 'cases', 'update', 'Update case fields'),
  ('cases.assign', 'cases', 'assign', 'Assign cases'),
  ('cases.close', 'cases', 'close', 'Resolve/close cases'),
  ('cases.link_alerts', 'cases', 'link', 'Link/unlink alerts to case'),
  ('cases.link_logs', 'cases', 'link', 'Link/unlink logs to case'),
  ('cases.manage_playbook', 'cases', 'playbook', 'Bind and progress case playbooks'),
  ('boards.read', 'boards', 'read', 'View investigation boards'),
  ('boards.create_case', 'boards', 'create', 'Create case boards'),
  ('boards.create_personal', 'boards', 'create', 'Create personal boards'),
  ('boards.edit', 'boards', 'update', 'Edit board state'),
  ('boards.delete', 'boards', 'delete', 'Delete boards'),
  ('playbooks.read', 'playbooks', 'read', 'View playbook library'),
  ('playbooks.edit', 'playbooks', 'update', 'Create/update playbook templates'),
  ('playbooks.approve', 'playbooks', 'approve', 'Approve/rollback playbook versions'),
  ('admin.users.manage', 'admin', 'users', 'Manage user roles'),
  ('admin.flags.manage', 'admin', 'feature_flags', 'Manage feature flags')
on conflict (key) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

insert into public.role_permissions (role, permission_key)
select 'admin', p.key
from public.permissions p
on conflict do nothing;

insert into public.role_permissions (role, permission_key)
values
  ('analyst', 'dashboard.read'),
  ('analyst', 'alerts.read'),
  ('analyst', 'alerts.update'),
  ('analyst', 'logs.read'),
  ('analyst', 'recommendations.read'),
  ('analyst', 'cases.read'),
  ('analyst', 'cases.create'),
  ('analyst', 'cases.update'),
  ('analyst', 'cases.assign'),
  ('analyst', 'cases.close'),
  ('analyst', 'cases.link_alerts'),
  ('analyst', 'cases.link_logs'),
  ('analyst', 'cases.manage_playbook'),
  ('analyst', 'boards.read'),
  ('analyst', 'boards.create_case'),
  ('analyst', 'boards.create_personal'),
  ('analyst', 'boards.edit'),
  ('analyst', 'boards.delete'),
  ('analyst', 'playbooks.read')
on conflict do nothing;

insert into public.role_permissions (role, permission_key)
values
  ('viewer', 'dashboard.read'),
  ('viewer', 'alerts.read'),
  ('viewer', 'logs.read'),
  ('viewer', 'recommendations.read'),
  ('viewer', 'cases.read'),
  ('viewer', 'boards.read'),
  ('viewer', 'playbooks.read')
on conflict do nothing;
