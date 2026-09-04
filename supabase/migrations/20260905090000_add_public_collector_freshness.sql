-- One public-safe timestamp per deployment namespace. It is intentionally
-- separate from suspension records: article times, effective dates, and record
-- mutations are not evidence that the operational sources were checked.
create table public.classstatus_collector_freshness (
  deployment_namespace text primary key
    check (deployment_namespace in ('preview', 'production')),
  last_successful_check_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.classstatus_collector_freshness enable row level security;
alter table public.classstatus_collector_freshness force row level security;
revoke all on table public.classstatus_collector_freshness
  from public, anon, authenticated, service_role;

create or replace function classstatus_private.record_successful_collector_check(
  p_namespace text,
  p_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform classstatus_private.assert_collector_lease_caller(p_namespace);
  if p_completed_at is null
     or p_completed_at > pg_catalog.clock_timestamp() + interval '5 minutes'
  then
    raise exception 'classstatus:collector-freshness-invalid';
  end if;

  insert into public.classstatus_collector_freshness as freshness (
    deployment_namespace, last_successful_check_at, updated_at
  ) values (
    p_namespace, p_completed_at, pg_catalog.clock_timestamp()
  )
  on conflict (deployment_namespace) do update
    set last_successful_check_at = excluded.last_successful_check_at,
        updated_at = excluded.updated_at
    where excluded.last_successful_check_at >= freshness.last_successful_check_at;
  return true;
end
$$;

create or replace function classstatus_private.get_public_collector_freshness(
  p_namespace text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lastSuccessfulCheckAt', freshness.last_successful_check_at
  )
  from public.classstatus_collector_freshness freshness
  where freshness.deployment_namespace = p_namespace
  union all
  select jsonb_build_object('lastSuccessfulCheckAt', null)
  where not exists (
    select 1
    from public.classstatus_collector_freshness freshness
    where freshness.deployment_namespace = p_namespace
  )
  limit 1;
$$;

create function public.classstatus_preview_record_successful_collector_check(
  p_completed_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.record_successful_collector_check('preview', p_completed_at);
$$;

create function public.classstatus_production_record_successful_collector_check(
  p_completed_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.record_successful_collector_check('production', p_completed_at);
$$;

create function public.classstatus_preview_get_public_collector_freshness()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select classstatus_private.get_public_collector_freshness('preview'); $$;

create function public.classstatus_production_get_public_collector_freshness()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select classstatus_private.get_public_collector_freshness('production'); $$;

create or replace function public.classstatus_preview_worker_record_successful_collector_check(
  p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := classstatus_private.verify_preview_collector_capability(
    'logs.append', p_payload, p_issued_at, p_nonce, p_signature, 4096
  );
  if pg_catalog.jsonb_typeof(payload) <> 'object'
     or payload - 'completedAt' <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(payload -> 'completedAt') <> 'string'
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  perform pg_catalog.set_config('classstatus.collector_worker', 'preview', true);
  return classstatus_private.record_successful_collector_check(
    'preview', (payload ->> 'completedAt')::timestamptz
  );
end
$$;

create or replace function public.classstatus_production_worker_record_successful_collector_check(
  p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := classstatus_private.verify_production_collector_capability(
    'logs.append', p_payload, p_issued_at, p_nonce, p_signature, 4096
  );
  if pg_catalog.jsonb_typeof(payload) <> 'object'
     or payload - 'completedAt' <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(payload -> 'completedAt') <> 'string'
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  perform pg_catalog.set_config('classstatus.collector_worker', 'production', true);
  return classstatus_private.record_successful_collector_check(
    'production', (payload ->> 'completedAt')::timestamptz
  );
end
$$;

revoke execute on function classstatus_private.record_successful_collector_check(text, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function classstatus_private.get_public_collector_freshness(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_record_successful_collector_check(timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_record_successful_collector_check(timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_get_public_collector_freshness()
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_get_public_collector_freshness()
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_worker_record_successful_collector_check(text, bigint, uuid, text)
  from public, authenticated, service_role;
revoke execute on function public.classstatus_production_worker_record_successful_collector_check(text, bigint, uuid, text)
  from public, authenticated, service_role;

grant execute on function public.classstatus_preview_record_successful_collector_check(timestamptz)
  to authenticated;
grant execute on function public.classstatus_production_record_successful_collector_check(timestamptz)
  to authenticated;
grant execute on function public.classstatus_preview_get_public_collector_freshness()
  to anon, authenticated;
grant execute on function public.classstatus_production_get_public_collector_freshness()
  to anon, authenticated;
grant execute on function public.classstatus_preview_worker_record_successful_collector_check(text, bigint, uuid, text)
  to anon;
grant execute on function public.classstatus_production_worker_record_successful_collector_check(text, bigint, uuid, text)
  to anon;

revoke execute on all functions in schema classstatus_private
  from public, anon, authenticated, service_role;
