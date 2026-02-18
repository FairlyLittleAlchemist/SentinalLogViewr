alter table public.investigation_boards
  add column if not exists board_type text,
  add column if not exists parent_board_id uuid references public.investigation_boards(id) on delete set null;

with ranked as (
  select
    id,
    case_id,
    is_shared,
    created_at,
    row_number() over (partition by case_id order by created_at asc, id asc) as rn
  from public.investigation_boards
  where case_id is not null
)
update public.investigation_boards b
set board_type = case
  when b.case_id is null then 'personal'
  when b.is_shared = false then 'personal'
  when r.rn = 1 then 'master_shared'
  else 'sub_shared'
end
from ranked r
where b.id = r.id
  and b.board_type is null;

update public.investigation_boards
set board_type = 'personal'
where board_type is null;

with master_by_case as (
  select case_id, id as master_id
  from public.investigation_boards
  where board_type = 'master_shared'
)
update public.investigation_boards b
set parent_board_id = m.master_id
from master_by_case m
where b.case_id = m.case_id
  and b.board_type = 'sub_shared'
  and b.parent_board_id is null;

update public.investigation_boards
set is_shared = case when board_type in ('master_shared', 'sub_shared') then true else false end;

alter table public.investigation_boards
  alter column board_type set not null;

alter table public.investigation_boards
  drop constraint if exists investigation_boards_board_type_check;

alter table public.investigation_boards
  add constraint investigation_boards_board_type_check
  check (board_type in ('master_shared', 'sub_shared', 'personal'));

alter table public.investigation_boards
  drop constraint if exists investigation_boards_board_hierarchy_check;

alter table public.investigation_boards
  add constraint investigation_boards_board_hierarchy_check
  check (
    (board_type = 'master_shared' and case_id is not null and parent_board_id is null and is_shared = true)
    or (board_type = 'sub_shared' and case_id is not null and parent_board_id is not null and is_shared = true)
    or (board_type = 'personal' and parent_board_id is null and is_shared = false)
  );

create unique index if not exists investigation_boards_one_master_per_case_idx
  on public.investigation_boards(case_id)
  where board_type = 'master_shared' and case_id is not null;

create unique index if not exists investigation_boards_one_personal_per_case_user_idx
  on public.investigation_boards(case_id, owner_id)
  where board_type = 'personal' and case_id is not null;

create index if not exists investigation_boards_parent_board_idx
  on public.investigation_boards(parent_board_id)
  where board_type = 'sub_shared';

create or replace function public.validate_investigation_board_hierarchy()
returns trigger
language plpgsql
as $$
declare
  parent_case_id uuid;
  parent_type text;
begin
  if new.board_type = 'sub_shared' then
    if new.parent_board_id is null then
      raise exception 'sub_shared board requires parent_board_id';
    end if;

    select case_id, board_type
      into parent_case_id, parent_type
    from public.investigation_boards
    where id = new.parent_board_id;

    if parent_case_id is null then
      raise exception 'parent board not found';
    end if;
    if parent_type <> 'master_shared' then
      raise exception 'sub_shared parent must be master_shared';
    end if;
    if parent_case_id <> new.case_id then
      raise exception 'sub_shared parent must belong to same case';
    end if;
  end if;

  if new.board_type in ('master_shared', 'personal') and new.parent_board_id is not null then
    raise exception 'only sub_shared boards may have parent_board_id';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_investigation_board_hierarchy_trg on public.investigation_boards;
create trigger validate_investigation_board_hierarchy_trg
before insert or update on public.investigation_boards
for each row
execute function public.validate_investigation_board_hierarchy();
