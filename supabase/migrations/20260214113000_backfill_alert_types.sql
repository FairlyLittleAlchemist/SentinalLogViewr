-- Ensure existing events and alerts carry a normalized type so per-tab filtering works.
-- Uses classify_event_type (added in prior migration) to map source_kind to one of the four UI types.

update public.stg_events
set type = public.classify_event_type(
  coalesce(
    source_kind,
    provider,
    category,
    source
  )
)
where (type is null or type = '')
  and coalesce(source_kind, provider, category, source) is not null;

update public.alerts a
set type = public.classify_event_type(
  coalesce(
    a.provider,
    a.category,
    a.source
  )
)
where (a.type is null or a.type = '')
  and coalesce(a.provider, a.category, a.source) is not null;

-- Speed up type-based filtering in the API.
create index if not exists alerts_type_idx on public.alerts(type);
