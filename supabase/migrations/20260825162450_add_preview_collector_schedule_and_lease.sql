-- Durable, namespace-scoped collector execution leases.
create table if not exists public.classstatus_collector_leases (
  deployment_namespace text primary key
    check (deployment_namespace in ('preview', 'production')),
  owner_token uuid not null,
  acquired_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp(),
  check (lease_expires_at > acquired_at)
);

alter table public.classstatus_collector_leases enable row level security;
alter table public.classstatus_collector_leases force row level security;
revoke all on table public.classstatus_collector_leases from public, anon, authenticated, service_role;

-- One-time proof nonces are private implementation state. Valid proofs remain
-- recorded for five minutes; their 90-second time window prevents later reuse.
create table if not exists public.classstatus_collector_capability_nonces (
  deployment_namespace text not null
    check (deployment_namespace in ('preview', 'production')),
  nonce uuid not null,
  action text not null
    check (action in ('lease.acquire', 'lease.release', 'record.upsert', 'logs.append')),
  used_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  primary key (deployment_namespace, nonce),
  check (expires_at > used_at)
);

create index if not exists classstatus_collector_capability_nonces_expiry_idx
  on public.classstatus_collector_capability_nonces (expires_at);

alter table public.classstatus_collector_capability_nonces enable row level security;
alter table public.classstatus_collector_capability_nonces force row level security;
revoke all on table public.classstatus_collector_capability_nonces from public, anon, authenticated, service_role;

create or replace function classstatus_private.constant_time_equal(
  p_expected bytea,
  p_supplied bytea
)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  difference integer := 0;
  byte_index integer;
begin
  if pg_catalog.octet_length(p_expected) <> 32
     or pg_catalog.octet_length(p_supplied) <> 32
  then
    return false;
  end if;

  for byte_index in 0..31 loop
    difference := difference
      | (pg_catalog.get_byte(p_expected, byte_index) # pg_catalog.get_byte(p_supplied, byte_index));
  end loop;
  return difference = 0;
end
$$;

-- Validate a Preview worker proof before parsing its payload. The HMAC covers
-- the exact UTF-8 payload text, so JSON canonicalization cannot alter what was
-- authorized by the Vercel worker.
create or replace function classstatus_private.verify_preview_collector_capability(
  p_action text,
  p_payload text,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text,
  p_max_payload_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := (select auth.jwt() ->> 'role');
  now_epoch bigint := pg_catalog.floor(pg_catalog.date_part('epoch', clock_timestamp()))::bigint;
  cron_secret text;
  payload_hash text;
  signed_message text;
  expected_signature bytea;
  supplied_signature bytea;
  parsed_payload jsonb;
begin
  if caller_role <> 'anon' then
    raise exception 'classstatus:collector-proof-forbidden';
  end if;
  if p_action not in ('lease.acquire', 'lease.release', 'record.upsert', 'logs.append') then
    raise exception 'classstatus:collector-proof-action-invalid';
  end if;
  if p_payload is null
     or p_max_payload_bytes is null
     or p_max_payload_bytes <= 0
     or pg_catalog.octet_length(p_payload) > p_max_payload_bytes
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  if p_issued_at is null
     or p_issued_at < now_epoch - 90
     or p_issued_at > now_epoch + 30
  then
    raise exception 'classstatus:collector-proof-expired';
  end if;
  if p_nonce is null or p_signature is null or p_signature !~ '^[0-9a-f]{64}$' then
    raise exception 'classstatus:collector-proof-malformed';
  end if;

  select pg_catalog.btrim(secret.decrypted_secret)
    into cron_secret
  from vault.decrypted_secrets secret
  where secret.name = 'classstatus-preview-cron-secret'
  order by secret.created_at desc
  limit 1;

  if cron_secret is null or pg_catalog.length(cron_secret) < 43 then
    raise exception 'classstatus:collector-proof-unavailable';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload, 'UTF8'), 'sha256'),
    'hex'
  );
  signed_message := 'classstatus-collector-v1' || pg_catalog.chr(10)
    || 'preview' || pg_catalog.chr(10)
    || p_action || pg_catalog.chr(10)
    || p_issued_at::text || pg_catalog.chr(10)
    || p_nonce::text || pg_catalog.chr(10)
    || payload_hash;
  expected_signature := extensions.hmac(
    pg_catalog.convert_to(signed_message, 'UTF8'),
    pg_catalog.convert_to(cron_secret, 'UTF8'),
    'sha256'
  );
  supplied_signature := pg_catalog.decode(p_signature, 'hex');

  if not classstatus_private.constant_time_equal(expected_signature, supplied_signature) then
    raise exception 'classstatus:collector-proof-invalid';
  end if;

  delete from public.classstatus_collector_capability_nonces
  where expires_at <= clock_timestamp();

  begin
    insert into public.classstatus_collector_capability_nonces (
      deployment_namespace,
      nonce,
      action,
      used_at,
      expires_at
    ) values (
      'preview',
      p_nonce,
      p_action,
      clock_timestamp(),
      clock_timestamp() + interval '5 minutes'
    );
  exception when unique_violation then
    raise exception 'classstatus:collector-proof-replayed';
  end;

  begin
    parsed_payload := p_payload::jsonb;
  exception when others then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end;
  return parsed_payload;
end
$$;

create or replace function classstatus_private.assert_collector_lease_caller(p_namespace text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := (select auth.jwt() ->> 'role');
begin
  if p_namespace not in ('preview', 'production') then
    raise exception 'classstatus:namespace-invalid';
  end if;

  if p_namespace = 'preview' and caller_role = 'authenticated' then
    perform 1 from classstatus_private.assert_authenticated_principal('preview');
    return;
  end if;
  if p_namespace = 'preview'
     and caller_role = 'anon'
     and current_setting('classstatus.collector_worker', true) = 'preview'
  then
    return;
  end if;
  if p_namespace = 'production' and caller_role = 'service_role' then
    return;
  end if;

  raise exception 'classstatus:forbidden';
end
$$;

create or replace function classstatus_private.acquire_collector_lease(
  p_namespace text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired_owner uuid;
begin
  perform classstatus_private.assert_collector_lease_caller(p_namespace);
  if p_owner_token is null then
    raise exception 'classstatus:collector-lease-invalid';
  end if;

  insert into public.classstatus_collector_leases as lease (
    deployment_namespace,
    owner_token,
    acquired_at,
    lease_expires_at,
    updated_at
  ) values (
    p_namespace,
    p_owner_token,
    clock_timestamp(),
    clock_timestamp() + interval '5 minutes',
    clock_timestamp()
  )
  on conflict (deployment_namespace) do update
    set owner_token = excluded.owner_token,
        acquired_at = excluded.acquired_at,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = excluded.updated_at
    where lease.lease_expires_at <= clock_timestamp()
       or lease.owner_token = excluded.owner_token
  returning owner_token into acquired_owner;

  return acquired_owner = p_owner_token;
end
$$;

create or replace function classstatus_private.release_collector_lease(
  p_namespace text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform classstatus_private.assert_collector_lease_caller(p_namespace);
  delete from public.classstatus_collector_leases
  where deployment_namespace = p_namespace
    and owner_token = p_owner_token;
  return found;
end
$$;

create or replace function public.classstatus_preview_acquire_collector_lease(p_owner_token uuid)
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.acquire_collector_lease('preview', p_owner_token); $$;

create or replace function public.classstatus_preview_release_collector_lease(p_owner_token uuid)
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.release_collector_lease('preview', p_owner_token); $$;

create or replace function public.classstatus_production_acquire_collector_lease(p_owner_token uuid)
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.acquire_collector_lease('production', p_owner_token); $$;

create or replace function public.classstatus_production_release_collector_lease(p_owner_token uuid)
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.release_collector_lease('production', p_owner_token); $$;

revoke execute on function public.classstatus_preview_acquire_collector_lease(uuid)
  from public, anon, service_role;
revoke execute on function public.classstatus_preview_release_collector_lease(uuid)
  from public, anon, service_role;
revoke execute on function public.classstatus_production_acquire_collector_lease(uuid)
  from public, anon, authenticated;
revoke execute on function public.classstatus_production_release_collector_lease(uuid)
  from public, anon, authenticated;
grant execute on function public.classstatus_preview_acquire_collector_lease(uuid) to authenticated;
grant execute on function public.classstatus_preview_release_collector_lease(uuid) to authenticated;
grant execute on function public.classstatus_production_acquire_collector_lease(uuid) to service_role;
grant execute on function public.classstatus_production_release_collector_lease(uuid) to service_role;

-- Existing mutation implementations continue to enforce Tier 3 provenance,
-- source, conflict, lifecycle, and collector-log invariants. The marker below
-- is honored only for a verified anonymous Preview worker transaction.
create or replace function classstatus_private.resolve_admin_actor(
  p_namespace text,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns table(admin_user_id uuid, admin_session_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := (select auth.jwt() ->> 'role');
  resolved_user uuid;
  resolved_session uuid;
begin
  if p_namespace = 'preview'
     and caller_role = 'anon'
     and current_setting('classstatus.collector_worker', true) = 'preview'
  then
    return query select null::uuid, null::uuid;
    return;
  end if;

  if p_namespace = 'preview' then
    select context.admin_user_id, context.admin_session_id
      into resolved_user, resolved_session
    from classstatus_private.assert_authenticated_principal('preview') context;
  elsif p_namespace = 'production' and caller_role = 'service_role' then
    resolved_user := p_supplied_user_id;
    resolved_session := p_supplied_session_id;
  else
    raise exception 'classstatus:forbidden';
  end if;

  if resolved_user is null or resolved_session is null or not exists (
    select 1
    from public.classstatus_admin_principals principal
    join public.classstatus_admin_session_guards guard
      on guard.deployment_namespace = principal.deployment_namespace
     and guard.admin_user_id = principal.user_id
    where principal.deployment_namespace = p_namespace
      and principal.user_id = resolved_user
      and principal.enabled
      and guard.supabase_session_id = resolved_session
      and guard.revoked_at is null
      and guard.absolute_expires_at > clock_timestamp()
      and guard.last_seen_at > clock_timestamp() - interval '30 minutes'
  ) then
    raise exception 'classstatus:session-invalid';
  end if;

  return query select resolved_user, resolved_session;
end
$$;

create or replace function public.classstatus_preview_worker_acquire_collector_lease(
  p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  owner_token_text text;
begin
  payload := classstatus_private.verify_preview_collector_capability(
    'lease.acquire', p_payload, p_issued_at, p_nonce, p_signature, 256
  );
  if pg_catalog.jsonb_typeof(payload) <> 'object'
     or not (payload ? 'ownerToken')
     or payload - 'ownerToken' <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(payload -> 'ownerToken') <> 'string'
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  owner_token_text := payload ->> 'ownerToken';
  if owner_token_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  perform pg_catalog.set_config('classstatus.collector_worker', 'preview', true);
  return classstatus_private.acquire_collector_lease('preview', owner_token_text::uuid);
end
$$;

create or replace function public.classstatus_preview_worker_release_collector_lease(
  p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  owner_token_text text;
begin
  payload := classstatus_private.verify_preview_collector_capability(
    'lease.release', p_payload, p_issued_at, p_nonce, p_signature, 256
  );
  if pg_catalog.jsonb_typeof(payload) <> 'object'
     or not (payload ? 'ownerToken')
     or payload - 'ownerToken' <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(payload -> 'ownerToken') <> 'string'
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  owner_token_text := payload ->> 'ownerToken';
  if owner_token_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  perform pg_catalog.set_config('classstatus.collector_worker', 'preview', true);
  return classstatus_private.release_collector_lease('preview', owner_token_text::uuid);
end
$$;

create or replace function public.classstatus_preview_worker_upsert_collected(
  p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := classstatus_private.verify_preview_collector_capability(
    'record.upsert', p_payload, p_issued_at, p_nonce, p_signature, 131072
  );
  if pg_catalog.jsonb_typeof(payload) <> 'object'
     or not (payload ?& array['record', 'eventKey', 'conflictKey'])
     or payload - array['record', 'eventKey', 'conflictKey'] <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(payload -> 'record') <> 'object'
     or pg_catalog.jsonb_typeof(payload -> 'eventKey') <> 'string'
     or pg_catalog.jsonb_typeof(payload -> 'conflictKey') <> 'string'
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  perform pg_catalog.set_config('classstatus.collector_worker', 'preview', true);
  return classstatus_private.upsert_collected(
    'preview', payload -> 'record', payload ->> 'eventKey', payload ->> 'conflictKey'
  );
end
$$;

create or replace function public.classstatus_preview_worker_append_collector_logs(
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
    'logs.append', p_payload, p_issued_at, p_nonce, p_signature, 1048576
  );
  if pg_catalog.jsonb_typeof(payload) <> 'object'
     or not (payload ? 'logs')
     or payload - 'logs' <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(payload -> 'logs') <> 'array'
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  perform pg_catalog.set_config('classstatus.collector_worker', 'preview', true);
  return classstatus_private.append_collector_logs('preview', payload -> 'logs');
end
$$;

revoke execute on function public.classstatus_preview_worker_acquire_collector_lease(text, bigint, uuid, text)
  from public, authenticated, service_role;
revoke execute on function public.classstatus_preview_worker_release_collector_lease(text, bigint, uuid, text)
  from public, authenticated, service_role;
revoke execute on function public.classstatus_preview_worker_upsert_collected(text, bigint, uuid, text)
  from public, authenticated, service_role;
revoke execute on function public.classstatus_preview_worker_append_collector_logs(text, bigint, uuid, text)
  from public, authenticated, service_role;
grant execute on function public.classstatus_preview_worker_acquire_collector_lease(text, bigint, uuid, text) to anon;
grant execute on function public.classstatus_preview_worker_release_collector_lease(text, bigint, uuid, text) to anon;
grant execute on function public.classstatus_preview_worker_upsert_collected(text, bigint, uuid, text) to anon;
grant execute on function public.classstatus_preview_worker_append_collector_logs(text, bigint, uuid, text) to anon;

revoke execute on all functions in schema classstatus_private
  from public, anon, authenticated, service_role;

-- Supabase Cron calls the stable Preview URL. The bearer value is read at run
-- time from Vault and is never embedded in this migration or the pg_cron job.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function classstatus_private.invoke_preview_collector()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  select pg_catalog.btrim(secret.decrypted_secret)
    into cron_secret
  from vault.decrypted_secrets secret
  where secret.name = 'classstatus-preview-cron-secret'
  order by secret.created_at desc
  limit 1;

  if cron_secret is null or pg_catalog.length(cron_secret) < 43 then
    return null;
  end if;

  select net.http_post(
    url := 'https://class-status-preview.vercel.app/api/cron/collector',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;

  return request_id;
end
$$;

revoke execute on function classstatus_private.invoke_preview_collector()
  from public, anon, authenticated, service_role;

select cron.schedule(
  'classstatus-preview-collector-every-minute',
  '* * * * *',
  $job$select classstatus_private.invoke_preview_collector();$job$
);
