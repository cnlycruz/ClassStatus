-- Live admin operations: realtime collector diagnostics, privacy-friendly traffic
-- counters/presence support, and short-lived public announcements.

create table if not exists public.classstatus_site_visits (
  deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
  visit_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  primary key (deployment_namespace, visit_id)
);

alter table public.classstatus_site_visits enable row level security;
alter table public.classstatus_site_visits force row level security;
revoke all on table public.classstatus_site_visits from public, anon, authenticated, service_role;

create index if not exists classstatus_site_visits_started_idx
  on public.classstatus_site_visits (deployment_namespace, started_at desc);

create table if not exists public.classstatus_announcements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
  message text not null check (char_length(message) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '15 seconds')
);

alter table public.classstatus_announcements enable row level security;
alter table public.classstatus_announcements force row level security;
revoke all on table public.classstatus_announcements from public, anon, authenticated, service_role;
grant select on table public.classstatus_announcements to anon, authenticated;

create policy classstatus_public_reads_recent_announcements
  on public.classstatus_announcements
  for select
  to anon, authenticated
  using (expires_at > clock_timestamp() - interval '1 minute');

create index if not exists classstatus_announcements_recent_idx
  on public.classstatus_announcements (deployment_namespace, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'classstatus_announcements'
  ) then
    alter publication supabase_realtime add table public.classstatus_announcements;
  end if;
end
$$;

create or replace function classstatus_private.record_site_visit(
  p_namespace text,
  p_visit_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_namespace not in ('preview', 'production') or p_visit_id is null then
    raise exception 'classstatus:visit-invalid';
  end if;

  insert into public.classstatus_site_visits (deployment_namespace, visit_id)
  values (p_namespace, p_visit_id)
  on conflict do nothing;
  return true;
end
$$;

create or replace function classstatus_private.current_announcement(p_namespace text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'id', item.id,
      'message', item.message,
      'createdAt', item.created_at,
      'expiresAt', item.expires_at
    )
    from public.classstatus_announcements item
    where item.deployment_namespace = p_namespace
      and item.expires_at > clock_timestamp()
    order by item.created_at desc
    limit 1
  ), 'null'::jsonb);
$$;

create or replace function classstatus_private.create_announcement(
  p_namespace text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  clean_message text := pg_catalog.btrim(p_message);
  created public.classstatus_announcements%rowtype;
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace);

  if clean_message is null or char_length(clean_message) < 1 or char_length(clean_message) > 120 then
    raise exception 'classstatus:announcement-invalid';
  end if;

  insert into public.classstatus_announcements (
    deployment_namespace, message, created_at, expires_at
  ) values (
    p_namespace, clean_message, clock_timestamp(), clock_timestamp() + interval '10 seconds'
  )
  returning * into created;

  return jsonb_build_object(
    'id', created.id,
    'message', created.message,
    'createdAt', created.created_at,
    'expiresAt', created.expires_at
  );
end
$$;

create or replace function classstatus_private.list_announcements(
  p_namespace text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace);

  return coalesce((
    select jsonb_agg(row_data order by (row_data ->> 'createdAt')::timestamptz desc)
    from (
      select jsonb_build_object(
        'id', item.id,
        'message', item.message,
        'createdAt', item.created_at,
        'expiresAt', item.expires_at
      ) as row_data
      from public.classstatus_announcements item
      where item.deployment_namespace = p_namespace
      order by item.created_at desc
      limit safe_limit
    ) page
  ), '[]'::jsonb);
end
$$;

create or replace function classstatus_private.admin_traffic_metrics(p_namespace text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  manila_day_start timestamptz;
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace);

  manila_day_start := (
    date_trunc('day', clock_timestamp() at time zone 'Asia/Manila')
    at time zone 'Asia/Manila'
  );

  return jsonb_build_object(
    'totalVisits', (
      select count(*) from public.classstatus_site_visits visit
      where visit.deployment_namespace = p_namespace
    ),
    'todayVisits', (
      select count(*) from public.classstatus_site_visits visit
      where visit.deployment_namespace = p_namespace
        and visit.started_at >= manila_day_start
    ),
    'last15Minutes', (
      select count(*) from public.classstatus_site_visits visit
      where visit.deployment_namespace = p_namespace
        and visit.started_at >= clock_timestamp() - interval '15 minutes'
    )
  );
end
$$;

-- Collector logs are now persisted in small near-realtime batches. Append new
-- rows to a run instead of replacing the run JSON whenever a new batch arrives.
create or replace function classstatus_private.append_collector_logs(
  p_namespace text,
  p_logs jsonb,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  first_log jsonb;
  last_log jsonb;
  resolved_run_id text;
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);

  if jsonb_typeof(p_logs) <> 'array'
     or jsonb_array_length(p_logs) = 0
     or jsonb_array_length(p_logs) > 500 then
    raise exception 'classstatus:collector-log-invalid';
  end if;

  first_log := p_logs -> 0;
  last_log := p_logs -> (jsonb_array_length(p_logs) - 1);
  resolved_run_id := first_log ->> 'runId';

  if resolved_run_id is null
     or length(resolved_run_id) > 128
     or exists (
       select 1 from jsonb_array_elements(p_logs) item
       where item ->> 'runId' <> resolved_run_id
     ) then
    raise exception 'classstatus:collector-log-invalid';
  end if;

  insert into public.classstatus_collector_runs as current_run (
    deployment_namespace, run_id, started_at, completed_at, logs, summary
  ) values (
    p_namespace,
    resolved_run_id,
    (first_log ->> 'timestamp')::timestamptz,
    case when last_log ->> 'message' like 'Sweep complete:%'
      then (last_log ->> 'timestamp')::timestamptz else null end,
    p_logs,
    case when last_log ->> 'message' like 'Sweep complete:%'
      then jsonb_build_object('message', last_log ->> 'message') else null end
  )
  on conflict on constraint classstatus_collector_runs_pkey do update
  set started_at = least(current_run.started_at, excluded.started_at),
      completed_at = coalesce(excluded.completed_at, current_run.completed_at),
      logs = current_run.logs || excluded.logs,
      summary = coalesce(excluded.summary, current_run.summary),
      updated_at = clock_timestamp();

  return true;
end
$$;

create or replace function public.classstatus_preview_record_visit(p_visit_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$ select classstatus_private.record_site_visit('preview', p_visit_id); $$;

create or replace function public.classstatus_production_record_visit(p_visit_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$ select classstatus_private.record_site_visit('production', p_visit_id); $$;

create or replace function public.classstatus_preview_current_announcement()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.current_announcement('preview'); $$;

create or replace function public.classstatus_production_current_announcement()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.current_announcement('production'); $$;

create or replace function public.classstatus_preview_create_announcement(p_message text)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.create_announcement('preview', p_message); $$;

create or replace function public.classstatus_production_create_announcement(p_message text)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.create_announcement('production', p_message); $$;

create or replace function public.classstatus_preview_list_announcements(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.list_announcements('preview', p_limit); $$;

create or replace function public.classstatus_production_list_announcements(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.list_announcements('production', p_limit); $$;

create or replace function public.classstatus_preview_admin_traffic_metrics()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.admin_traffic_metrics('preview'); $$;

create or replace function public.classstatus_production_admin_traffic_metrics()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.admin_traffic_metrics('production'); $$;

revoke execute on function public.classstatus_preview_record_visit(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_record_visit(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_current_announcement() from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_current_announcement() from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_create_announcement(text) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_create_announcement(text) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_list_announcements(integer) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_announcements(integer) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_admin_traffic_metrics() from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_admin_traffic_metrics() from public, anon, authenticated, service_role;

grant execute on function public.classstatus_preview_record_visit(uuid) to anon, authenticated;
grant execute on function public.classstatus_production_record_visit(uuid) to anon, authenticated;
grant execute on function public.classstatus_preview_current_announcement() to anon, authenticated;
grant execute on function public.classstatus_production_current_announcement() to anon, authenticated;
grant execute on function public.classstatus_preview_create_announcement(text) to authenticated;
grant execute on function public.classstatus_production_create_announcement(text) to authenticated;
grant execute on function public.classstatus_preview_list_announcements(integer) to authenticated;
grant execute on function public.classstatus_production_list_announcements(integer) to authenticated;
grant execute on function public.classstatus_preview_admin_traffic_metrics() to authenticated;
grant execute on function public.classstatus_production_admin_traffic_metrics() to authenticated;
