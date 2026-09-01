-- Reliable active visitor tracking that does not depend on WebSocket Presence.
-- Public clients send a lightweight Supabase RPC heartbeat while visible.
-- Admin metrics treat a visitor as active when their heartbeat is fresh.

create table if not exists public.classstatus_site_presence (
  deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
  visitor_id uuid not null,
  path text not null default '/',
  lgu_id text,
  last_seen timestamptz not null default clock_timestamp(),
  primary key (deployment_namespace, visitor_id),
  check (char_length(path) between 1 and 240),
  check (lgu_id is null or char_length(lgu_id) between 1 and 80)
);

alter table public.classstatus_site_presence enable row level security;
alter table public.classstatus_site_presence force row level security;
revoke all on table public.classstatus_site_presence from public, anon, authenticated, service_role;

create index if not exists classstatus_site_presence_active_idx
  on public.classstatus_site_presence (deployment_namespace, last_seen desc);

create index if not exists classstatus_site_presence_lgu_active_idx
  on public.classstatus_site_presence (deployment_namespace, lgu_id, last_seen desc)
  where lgu_id is not null;

create or replace function classstatus_private.touch_site_presence(
  p_namespace text,
  p_visitor_id uuid,
  p_path text default '/',
  p_lgu_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_path text := left(coalesce(nullif(pg_catalog.btrim(p_path), ''), '/'), 240);
  clean_lgu_id text := nullif(pg_catalog.btrim(p_lgu_id), '');
begin
  if p_namespace not in ('preview', 'production') or p_visitor_id is null then
    raise exception 'classstatus:presence-invalid';
  end if;

  if clean_lgu_id is not null and char_length(clean_lgu_id) > 80 then
    raise exception 'classstatus:presence-invalid';
  end if;

  insert into public.classstatus_site_presence as presence (
    deployment_namespace,
    visitor_id,
    path,
    lgu_id,
    last_seen
  ) values (
    p_namespace,
    p_visitor_id,
    clean_path,
    clean_lgu_id,
    clock_timestamp()
  )
  on conflict (deployment_namespace, visitor_id) do update
  set path = excluded.path,
      lgu_id = excluded.lgu_id,
      last_seen = excluded.last_seen;

  return true;
end
$$;

create or replace function public.classstatus_preview_touch_presence(
  p_visitor_id uuid,
  p_path text default '/',
  p_lgu_id text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.touch_site_presence('preview', p_visitor_id, p_path, p_lgu_id);
$$;

create or replace function public.classstatus_production_touch_presence(
  p_visitor_id uuid,
  p_path text default '/',
  p_lgu_id text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.touch_site_presence('production', p_visitor_id, p_path, p_lgu_id);
$$;

revoke execute on function public.classstatus_preview_touch_presence(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_touch_presence(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.classstatus_preview_touch_presence(uuid, text, text)
  to anon, authenticated;
grant execute on function public.classstatus_production_touch_presence(uuid, text, text)
  to anon, authenticated;

create or replace function classstatus_private.admin_traffic_metrics(p_namespace text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  manila_day_start timestamptz;
  active_cutoff timestamptz := clock_timestamp() - interval '40 seconds';
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
    ),
    'activeNow', (
      select count(*) from public.classstatus_site_presence presence
      where presence.deployment_namespace = p_namespace
        and presence.last_seen >= active_cutoff
    ),
    'mostViewed', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', ranked.lgu_id, 'count', ranked.viewer_count)
        order by ranked.viewer_count desc, ranked.lgu_id asc
      )
      from (
        select presence.lgu_id, count(*)::integer as viewer_count
        from public.classstatus_site_presence presence
        where presence.deployment_namespace = p_namespace
          and presence.last_seen >= active_cutoff
          and presence.lgu_id is not null
        group by presence.lgu_id
        order by count(*) desc, presence.lgu_id asc
        limit 5
      ) ranked
    ), '[]'::jsonb)
  );
end
$$;
