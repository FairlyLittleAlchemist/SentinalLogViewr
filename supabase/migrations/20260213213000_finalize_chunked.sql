drop index if exists public.alerts_parsed_facts_gin;
drop index if exists public.logs_parsed_facts_gin;

create or replace function public.ingest_start_publish(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.ingest_runs where id = p_run_id) then
    raise exception 'ingest run % does not exist', p_run_id;
  end if;

  if not exists (select 1 from public.stg_events where ingest_run_id = p_run_id) then
    raise exception 'ingest run % has no staged rows', p_run_id;
  end if;

  update public.ingest_runs
  set status = 'publishing'
  where id = p_run_id;
end;
$$;

create or replace function public.ingest_publish_logs(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '0', true);

  truncate table public.logs;

  insert into public.logs (
    id,
    timestamp,
    severity,
    source,
    category,
    message,
    ip_address,
    "user",
    status,
    provider,
    event_code,
    event_name,
    actor,
    resource,
    payload_raw,
    payload_json,
    parsed_facts,
    source_file
  )
  select
    'log-' || e.event_uid as id,
    e.occurred_at as timestamp,
    e.severity,
    coalesce(nullif(e.source, ''), coalesce(nullif(e.provider, ''), e.source_kind)) as source,
    coalesce(nullif(e.category, ''), 'Unknown') as category,
    coalesce(nullif(e.summary, ''), nullif(e.description, ''), 'No description provided.') as message,
    coalesce(nullif(e.ip_address, ''), 'Unknown') as ip_address,
    coalesce(nullif(e.actor, ''), 'Unknown') as "user",
    case
      when e.status in ('new', 'investigating', 'resolved', 'dismissed') then e.status
      when e.status = 'in_progress' then 'investigating'
      else 'new'
    end as status,
    e.provider,
    e.event_code,
    e.event_name,
    e.actor,
    e.resource,
    e.payload_raw,
    e.payload_json,
    e.parsed_facts,
    e.source_file
  from public.stg_events e
  where e.ingest_run_id = p_run_id;
end;
$$;

create or replace function public.ingest_publish_alerts(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '0', true);

  create temporary table _next_alerts
  on commit drop
  as
  select
    'alert-' || e.event_uid as id,
    coalesce(nullif(e.title, ''), nullif(e.event_name, ''), nullif(e.category, ''), 'Event') as title,
    case when e.severity = 'informational' then 'low' else e.severity end as severity,
    case
      when e.status in ('new', 'in_progress', 'resolved', 'dismissed') then e.status
      when e.status = 'investigating' then 'in_progress'
      else 'new'
    end as status,
    coalesce(nullif(e.source, ''), coalesce(nullif(e.provider, ''), e.source_kind)) as source,
    e.occurred_at as timestamp,
    coalesce(nullif(e.description, ''), nullif(e.summary, ''), 'No description provided.') as description,
    nullif(e.assignee, '') as assignee,
    case
      when cardinality(e.tactics) > 0 then e.tactics
      else array[coalesce(nullif(e.category, ''), e.source_kind)]
    end as tactics,
    case
      when cardinality(e.affected_entities) > 0 then e.affected_entities
      else array['Unknown']
    end as affected_entities,
    case
      when cardinality(e.recommended_actions) > 0 then e.recommended_actions
      else array['Review event context', 'Validate source and actor', 'Document triage outcome']
    end as recommended_actions,
    e.provider,
    e.category,
    e.event_code,
    e.event_name,
    e.actor,
    e.resource,
    e.ip_address,
    e.payload_raw,
    e.payload_json,
    e.parsed_facts,
    e.source_file
  from public.stg_events e
  where e.ingest_run_id = p_run_id
    and (
      e.source_kind = 'incident'
      or e.is_alert_candidate
      or e.severity in ('critical', 'high')
    );

  delete from public.alerts
  where id not in (select id from _next_alerts);

  insert into public.alerts (
    id,
    title,
    severity,
    status,
    detected_status,
    source,
    timestamp,
    description,
    assignee,
    tactics,
    affected_entities,
    recommended_actions,
    provider,
    category,
    event_code,
    event_name,
    actor,
    resource,
    ip_address,
    payload_raw,
    payload_json,
    parsed_facts,
    source_file
  )
  select
    n.id,
    n.title,
    n.severity,
    n.status,
    n.status as detected_status,
    n.source,
    n.timestamp,
    n.description,
    n.assignee,
    n.tactics,
    n.affected_entities,
    n.recommended_actions,
    n.provider,
    n.category,
    n.event_code,
    n.event_name,
    n.actor,
    n.resource,
    n.ip_address,
    n.payload_raw,
    n.payload_json,
    n.parsed_facts,
    n.source_file
  from _next_alerts n
  on conflict (id)
  do update set
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
    source_file = excluded.source_file;
end;
$$;

create or replace function public.ingest_publish_rollups(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '0', true);

  truncate table public.threat_metrics;
  truncate table public.alert_time_series restart identity;
  truncate table public.severity_distribution;
  truncate table public.attack_sources;

  insert into public.threat_metrics (label, value, change, change_type)
  values
    ('Total Alerts', (select count(*)::numeric from public.alerts), 0, 'increase'),
    ('Critical Incidents', (select count(*)::numeric from public.alerts where severity = 'critical'), 0, 'increase'),
    ('Active Investigations', (select count(*)::numeric from public.alerts where status = 'in_progress'), 0, 'decrease'),
    ('Mean Response Time', 0, 0, 'decrease');

  with buckets as (
    select
      date_trunc('hour', timezone('utc', timestamp)) as hour_slot,
      count(*) filter (where severity = 'critical') as critical,
      count(*) filter (where severity = 'high') as high,
      count(*) filter (where severity = 'medium') as medium,
      count(*) filter (where severity = 'low') as low
    from public.alerts
    group by 1
  ),
  anchor as (
    select coalesce(max(hour_slot), date_trunc('hour', timezone('utc', now()))) as max_hour
    from buckets
  ),
  series as (
    select generate_series(max_hour - interval '23 hours', max_hour, interval '1 hour') as hour_slot
    from anchor
  )
  insert into public.alert_time_series (time, critical, high, medium, low)
  select
    to_char(series.hour_slot, 'YYYY-MM-DD"T"HH24:00:00"Z"') as time,
    coalesce(buckets.critical, 0) as critical,
    coalesce(buckets.high, 0) as high,
    coalesce(buckets.medium, 0) as medium,
    coalesce(buckets.low, 0) as low
  from series
  left join buckets on buckets.hour_slot = series.hour_slot
  order by series.hour_slot;

  insert into public.severity_distribution (name, value, fill)
  values
    ('Critical', (select count(*) from public.alerts where severity = 'critical'), 'hsl(0, 72%, 51%)'),
    ('High', (select count(*) from public.alerts where severity = 'high'), 'hsl(38, 92%, 50%)'),
    ('Medium', (select count(*) from public.alerts where severity = 'medium'), 'hsl(199, 89%, 48%)'),
    ('Low', (select count(*) from public.alerts where severity = 'low'), 'hsl(142, 71%, 45%)');

  with ranked_sources as (
    select
      case
        when coalesce(nullif(e.ip_address, ''), '') <> '' then e.ip_address
        when coalesce(nullif(e.resource, ''), '') <> '' then e.resource
        else e.source
      end as source_key,
      case
        when coalesce(nullif(e.ip_address, ''), '') <> '' then 'ip'
        when coalesce(nullif(e.resource, ''), '') <> '' then 'resource'
        else 'source'
      end as source_type,
      count(*) as total
    from public.stg_events e
    where e.ingest_run_id = p_run_id
      and (
        coalesce(nullif(e.ip_address, ''), '') <> ''
        or coalesce(nullif(e.resource, ''), '') <> ''
        or coalesce(nullif(e.source, ''), '') <> ''
      )
    group by 1, 2
  ),
  totals as (
    select greatest((select count(*) from public.stg_events where ingest_run_id = p_run_id), 1) as alert_total
  )
  insert into public.attack_sources (country, source_type, count, percentage)
  select
    ranked_sources.source_key as country,
    ranked_sources.source_type,
    ranked_sources.total as count,
    round((ranked_sources.total::numeric / totals.alert_total::numeric) * 100, 1) as percentage
  from ranked_sources
  cross join totals
  order by ranked_sources.total desc
  limit 6;
end;
$$;

create or replace function public.ingest_finish_publish(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ingest_runs
  set
    status = 'success',
    finished_at = now(),
    rows_loaded = (
      select count(*)
      from public.stg_events
      where ingest_run_id = p_run_id
    )
  where id = p_run_id;
end;
$$;

create or replace function public.finalize_ingest_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ingest_start_publish(p_run_id);
  perform public.ingest_publish_logs(p_run_id);
  perform public.ingest_publish_alerts(p_run_id);
  perform public.ingest_publish_rollups(p_run_id);
  perform public.ingest_finish_publish(p_run_id);
end;
$$;
