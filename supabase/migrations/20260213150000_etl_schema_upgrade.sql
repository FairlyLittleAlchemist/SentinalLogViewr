alter table public.alerts
  add column if not exists provider text,
  add column if not exists category text,
  add column if not exists event_code text,
  add column if not exists event_name text,
  add column if not exists actor text,
  add column if not exists resource text,
  add column if not exists ip_address text,
  add column if not exists payload_raw text,
  add column if not exists payload_json jsonb,
  add column if not exists source_file text;

alter table public.logs
  add column if not exists provider text,
  add column if not exists event_code text,
  add column if not exists event_name text,
  add column if not exists actor text,
  add column if not exists resource text,
  add column if not exists payload_raw text,
  add column if not exists payload_json jsonb,
  add column if not exists source_file text;

create index if not exists alerts_timestamp_idx on public.alerts (timestamp desc);
create index if not exists alerts_severity_idx on public.alerts (severity);
create index if not exists alerts_source_idx on public.alerts (source);
create index if not exists alerts_event_code_idx on public.alerts (event_code);

create index if not exists logs_timestamp_idx on public.logs (timestamp desc);
create index if not exists logs_severity_idx on public.logs (severity);
create index if not exists logs_source_idx on public.logs (source);
create index if not exists logs_event_code_idx on public.logs (event_code);
