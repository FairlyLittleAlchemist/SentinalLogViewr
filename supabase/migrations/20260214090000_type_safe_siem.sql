-- Type-safe SIEM rework

-- Add type column to staging
alter table public.stg_events
  add column if not exists type text check (type in ('incident','security_event','activity','firewall'));

create index if not exists stg_events_type_idx on public.stg_events(type);

-- Relax alerts severity to include informational
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'alerts_severity_check'
      and conrelid = 'public.alerts'::regclass
  ) then
    alter table public.alerts drop constraint alerts_severity_check;
  end if;
end $$;

alter table public.alerts
  add constraint alerts_severity_check
  check (severity in ('critical','high','medium','low','informational'));

-- Relax alerts status/detected_status to include investigating
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'alerts_status_check'
      and conrelid = 'public.alerts'::regclass
  ) then
    alter table public.alerts drop constraint alerts_status_check;
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'alerts_detected_status_check'
      and conrelid = 'public.alerts'::regclass
  ) then
    alter table public.alerts drop constraint alerts_detected_status_check;
  end if;
end $$;

alter table public.alerts
  add constraint alerts_status_check
  check (status in ('new','in_progress','resolved','dismissed','investigating'));

alter table public.alerts
  add constraint alerts_detected_status_check
  check (detected_status in ('new','in_progress','resolved','dismissed','investigating'));

-- Curated per-type tables
create table if not exists public.incidents (
  id text primary key,
  title text not null,
  severity text not null,
  status text not null,
  detected_status text not null,
  source text not null,
  provider text,
  category text,
  timestamp timestamptz not null,
  description text,
  assignee text,
  tactics text[] not null default '{}'::text[],
  affected_entities text[] not null default '{}'::text[],
  recommended_actions text[] not null default '{}'::text[],
  event_code text,
  event_name text,
  actor text,
  resource text,
  ip_address text,
  payload_raw text,
  payload_json jsonb,
  parsed_facts jsonb,
  source_file text,
  summary text
);

create table if not exists public.security_events (like public.incidents);
create table if not exists public.activity_events (like public.incidents);
create table if not exists public.firewall_events (like public.incidents);

-- Alerts table remains canonical unified store
-- We rebuild it in finalize to include type.
alter table public.alerts
  add column if not exists type text check (type in ('incident','security_event','activity','firewall'));
alter table public.alerts
  add column if not exists summary text;

-- Helper function to classify source_kind -> type
create or replace function public.classify_event_type(p_source_kind text)
returns text
language plpgsql
as $$
begin
  if p_source_kind ilike 'incident%' then
    return 'incident';
  elsif p_source_kind ilike 'security%' then
    return 'security_event';
  elsif p_source_kind ilike 'activity%' then
    return 'activity';
  elsif p_source_kind ilike 'firewall%' then
    return 'firewall';
  else
    return 'security_event';
  end if;
end;
$$;

-- Redefine finalize pipeline to populate curated tables then alerts
create or replace function public.ingest_publish_alerts(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '0', true);

  -- normalize type in staging if missing
  update public.stg_events
  set type = classify_event_type(source_kind)
  where ingest_run_id = p_run_id
    and (type is null or type = '');

  -- helper to process each type (full run)
  perform public._ingest_publish_type(p_run_id, 'incident');
  perform public._ingest_publish_type(p_run_id, 'security_event');
  perform public._ingest_publish_type(p_run_id, 'activity');
  perform public._ingest_publish_type(p_run_id, 'firewall');

end;
$$;

create or replace function public.ingest_publish_alerts_type(p_run_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '0', true);
  perform public._ingest_publish_type(p_run_id, p_type);
end;
$$;

-- per-type helper to shrink work per RPC
create or replace function public._ingest_publish_type(p_run_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_table text;
begin
  perform set_config('statement_timeout', '0', true);

  target_table := case p_type
    when 'incident' then 'incidents'
    when 'security_event' then 'security_events'
    when 'activity' then 'activity_events'
    when 'firewall' then 'firewall_events'
    else 'security_events'
  end;

  execute format('delete from %I where id in (select event_uid from public.stg_events where ingest_run_id = $1 and type = $2)', target_table)
  using p_run_id, p_type;

  execute format(
    'insert into %I (id,title,severity,status,detected_status,source,provider,category,timestamp,description,assignee,
      tactics,affected_entities,recommended_actions,event_code,event_name,actor,resource,ip_address,payload_raw,payload_json,parsed_facts,source_file,summary)
     select event_uid,title,severity,status,status,source,provider,category,occurred_at,description,assignee,
      tactics,affected_entities,recommended_actions,event_code,event_name,actor,resource,ip_address,payload_raw,payload_json,parsed_facts,source_file,summary
     from public.stg_events
     where ingest_run_id = $1 and type = $2', target_table)
  using p_run_id, p_type;

  -- upsert into alerts for this type only
  insert into public.alerts (
    id,title,severity,status,detected_status,source,timestamp,description,assignee,tactics,
    affected_entities,recommended_actions,provider,category,event_code,event_name,actor,resource,
    ip_address,payload_raw,payload_json,parsed_facts,source_file,type,summary
  )
  select
    event_uid,title,severity,status,status,source,occurred_at,description,assignee,
    tactics,affected_entities,recommended_actions,provider,category,event_code,event_name,actor,resource,
    ip_address,payload_raw,payload_json,parsed_facts,source_file,p_type,summary
  from public.stg_events
  where ingest_run_id = p_run_id and type = p_type
  on conflict (id) do update set
    title = excluded.title,
    severity = excluded.severity,
    status = excluded.status,
    detected_status = excluded.detected_status,
    source = excluded.source,
    timestamp = excluded.timestamp,
    description = excluded.description,
    assignee = excluded.assignee,
    tactics = excluded.tactics,
    affected_entities = excluded.affected_entities,
    recommended_actions = excluded.recommended_actions,
    provider = excluded.provider,
    category = excluded.category,
    event_code = excluded.event_code,
    event_name = excluded.event_name,
    actor = excluded.actor,
    resource = excluded.resource,
    ip_address = excluded.ip_address,
    payload_raw = excluded.payload_raw,
    payload_json = excluded.payload_json,
    parsed_facts = excluded.parsed_facts,
    source_file = excluded.source_file,
    type = excluded.type,
    summary = excluded.summary;

  -- prune stale alerts of this type not present in current run
  delete from public.alerts a
  where a.type = p_type
    and not exists (
      select 1 from public.stg_events s
      where s.ingest_run_id = p_run_id
        and s.type = p_type
        and s.event_uid = a.id
    );
end;
$$;
