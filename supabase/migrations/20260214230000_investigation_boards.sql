create extension if not exists pgcrypto;

create table if not exists public.investigation_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.alert_cases(id) on delete set null,
  is_shared boolean not null default false,
  viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investigation_board_nodes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.investigation_boards(id) on delete cascade,
  node_id text not null,
  node_type text not null check (node_type in ('alert','log','note','entity','evidence')),
  ref_id text,
  label text not null,
  subtitle text,
  x numeric not null default 0,
  y numeric not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, node_id)
);

create table if not exists public.investigation_board_edges (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.investigation_boards(id) on delete cascade,
  edge_id text not null,
  source_node_id text not null,
  target_node_id text not null,
  edge_type text not null default 'related_to' check (edge_type in ('related_to','caused_by','observed_on','same_actor','same_ip','hypothesis')),
  label text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, edge_id)
);

create index if not exists investigation_boards_owner_idx on public.investigation_boards(owner_id);
create index if not exists investigation_board_nodes_board_idx on public.investigation_board_nodes(board_id);
create index if not exists investigation_board_edges_board_idx on public.investigation_board_edges(board_id);

drop trigger if exists set_investigation_boards_updated_at on public.investigation_boards;
create trigger set_investigation_boards_updated_at
before update on public.investigation_boards
for each row
execute function public.set_updated_at_column();

drop trigger if exists set_investigation_board_nodes_updated_at on public.investigation_board_nodes;
create trigger set_investigation_board_nodes_updated_at
before update on public.investigation_board_nodes
for each row
execute function public.set_updated_at_column();

drop trigger if exists set_investigation_board_edges_updated_at on public.investigation_board_edges;
create trigger set_investigation_board_edges_updated_at
before update on public.investigation_board_edges
for each row
execute function public.set_updated_at_column();

alter table public.investigation_boards enable row level security;
alter table public.investigation_board_nodes enable row level security;
alter table public.investigation_board_edges enable row level security;

drop policy if exists "investigation_boards_read_authenticated" on public.investigation_boards;
create policy "investigation_boards_read_authenticated"
on public.investigation_boards
for select
using (auth.uid() = owner_id or is_shared = true or public.has_role(array['admin']));

drop policy if exists "investigation_boards_write_owner_admin" on public.investigation_boards;
create policy "investigation_boards_write_owner_admin"
on public.investigation_boards
for all
using (auth.uid() = owner_id or public.has_role(array['admin','analyst']))
with check (auth.uid() = owner_id or public.has_role(array['admin','analyst']));

drop policy if exists "investigation_board_nodes_read_authenticated" on public.investigation_board_nodes;
create policy "investigation_board_nodes_read_authenticated"
on public.investigation_board_nodes
for select
using (
  exists (
    select 1
    from public.investigation_boards b
    where b.id = board_id
      and (b.owner_id = auth.uid() or b.is_shared = true or public.has_role(array['admin']))
  )
);

drop policy if exists "investigation_board_nodes_write_owner_admin" on public.investigation_board_nodes;
create policy "investigation_board_nodes_write_owner_admin"
on public.investigation_board_nodes
for all
using (
  exists (
    select 1
    from public.investigation_boards b
    where b.id = board_id
      and (b.owner_id = auth.uid() or public.has_role(array['admin','analyst']))
  )
)
with check (
  exists (
    select 1
    from public.investigation_boards b
    where b.id = board_id
      and (b.owner_id = auth.uid() or public.has_role(array['admin','analyst']))
  )
);

drop policy if exists "investigation_board_edges_read_authenticated" on public.investigation_board_edges;
create policy "investigation_board_edges_read_authenticated"
on public.investigation_board_edges
for select
using (
  exists (
    select 1
    from public.investigation_boards b
    where b.id = board_id
      and (b.owner_id = auth.uid() or b.is_shared = true or public.has_role(array['admin']))
  )
);

drop policy if exists "investigation_board_edges_write_owner_admin" on public.investigation_board_edges;
create policy "investigation_board_edges_write_owner_admin"
on public.investigation_board_edges
for all
using (
  exists (
    select 1
    from public.investigation_boards b
    where b.id = board_id
      and (b.owner_id = auth.uid() or public.has_role(array['admin','analyst']))
  )
)
with check (
  exists (
    select 1
    from public.investigation_boards b
    where b.id = board_id
      and (b.owner_id = auth.uid() or public.has_role(array['admin','analyst']))
  )
);
