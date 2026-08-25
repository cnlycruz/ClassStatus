-- Production runtime/security support. This migration is deliberately free of
-- scheduler activation so it can be applied before the Production deployment.

alter table public.classstatus_collector_leases enable row level security;
alter table public.classstatus_collector_leases force row level security;
revoke all on table public.classstatus_collector_leases
  from public, anon, authenticated, service_role;

alter table public.classstatus_collector_capability_nonces enable row level security;
alter table public.classstatus_collector_capability_nonces force row level security;
revoke all on table public.classstatus_collector_capability_nonces
  from public, anon, authenticated, service_role;

-- The Production proof is intentionally namespace- and Vault-name-specific.
-- A Preview proof therefore cannot authorize any Production worker action.
create or replace function classstatus_private.verify_production_collector_capability(
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
  now_epoch bigint := pg_catalog.floor(
    pg_catalog.date_part('epoch', clock_timestamp())
  )::bigint;
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
  where secret.name = 'classstatus-production-cron-secret'
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
    || 'production' || pg_catalog.chr(10)
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
      'production',
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

-- Manual collectors authenticate as the namespace administrator. Scheduled
-- collectors use only a verified transaction-local worker marker. The legacy
-- Production service-role path remains temporarily available for rollback.
create or replace function classstatus_private.assert_collector_lease_caller(
  p_namespace text
)
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

  if caller_role = 'authenticated' then
    -- Manual collection is an admin operation: require both the namespace
    -- principal and its current guarded Supabase session.
    perform 1 from classstatus_private.resolve_admin_actor(p_namespace);
    return;
  end if;
  if caller_role = 'anon'
     and current_setting('classstatus.collector_worker', true) = p_namespace
  then
    return;
  end if;
  if p_namespace = 'production' and caller_role = 'service_role' then
    return;
  end if;

  raise exception 'classstatus:forbidden';
end
$$;

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
  if p_namespace in ('preview', 'production')
     and caller_role = 'anon'
     and current_setting('classstatus.collector_worker', true) = p_namespace
  then
    return query select null::uuid, null::uuid;
    return;
  end if;

  if p_namespace in ('preview', 'production') and caller_role = 'authenticated' then
    select context.admin_user_id, context.admin_session_id
      into resolved_user, resolved_session
    from classstatus_private.assert_authenticated_principal(p_namespace) context;
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

-- Authenticated Production session wrappers mirror the proven Preview surface.
create function public.classstatus_production_start_admin_session(
  p_csrf_digest text,
  p_login_fingerprint text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.start_admin_session(
    'production', p_csrf_digest, p_login_fingerprint
  );
$$;

create function public.classstatus_production_touch_admin_session(
  p_touch boolean default true
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.touch_admin_session('production', p_touch);
$$;

create function public.classstatus_production_revoke_admin_session()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.revoke_admin_session('production');
$$;

create function public.classstatus_production_admin_snapshot()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.admin_snapshot('production'); $$;

create function public.classstatus_production_create_confirmation(
  p_receipt_id uuid,
  p_payload_hash text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.create_confirmation(
    'production', p_receipt_id, p_payload_hash
  );
$$;

create function public.classstatus_production_publish_manual(
  p_record jsonb,
  p_confirmation_id uuid,
  p_confirmation_payload_hash text,
  p_request_hash text,
  p_idempotency_key uuid,
  p_target_summary text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.publish_manual(
    'production', p_record, p_confirmation_id, p_confirmation_payload_hash,
    p_request_hash, p_idempotency_key, p_target_summary
  );
$$;

create function public.classstatus_production_mutate_lifecycle(
  p_operation text,
  p_record_id text,
  p_expected_revision bigint,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.mutate_lifecycle(
    'production', p_operation, p_record_id, p_expected_revision,
    p_idempotency_key, p_request_hash
  );
$$;

create function public.classstatus_production_reconcile_removals()
returns integer
language sql
security definer
set search_path = ''
as $$ select classstatus_private.reconcile_removals('production'); $$;

-- PostgreSQL cannot remove argument defaults with CREATE OR REPLACE FUNCTION.
-- These exact legacy wrappers have no incoming database dependencies, so drop
-- them without CASCADE, recreate them without defaults, and restore their
-- service-role-only rollback privileges before adding authenticated overloads.
drop function public.classstatus_production_append_audit(
  text, text, text, text, text, text, timestamptz, uuid, uuid
);

create function public.classstatus_production_append_audit(
  p_action text,
  p_outcome text,
  p_record_id text,
  p_target_summary text,
  p_correlation_id text,
  p_reason_code text,
  p_effective_at timestamptz,
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.append_audit(
    'production', p_action, p_outcome, p_record_id, p_target_summary,
    p_correlation_id, p_reason_code, p_effective_at,
    p_admin_user_id, p_admin_session_id
  );
$$;

drop function public.classstatus_production_list_audit(
  integer, integer, uuid, uuid
);

create function public.classstatus_production_list_audit(
  p_limit integer,
  p_offset integer,
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.list_audit(
    'production', p_limit, p_offset, p_admin_user_id, p_admin_session_id
  );
$$;

drop function public.classstatus_production_list_collector_logs(
  integer, uuid, uuid
);

create function public.classstatus_production_list_collector_logs(
  p_limit integer,
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.list_collector_logs(
    'production', p_limit, p_admin_user_id, p_admin_session_id
  );
$$;

revoke execute on function public.classstatus_production_append_audit(
  text, text, text, text, text, text, timestamptz, uuid, uuid
) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_audit(
  integer, integer, uuid, uuid
) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_collector_logs(
  integer, uuid, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.classstatus_production_append_audit(
  text, text, text, text, text, text, timestamptz, uuid, uuid
) to service_role;
grant execute on function public.classstatus_production_list_audit(
  integer, integer, uuid, uuid
) to service_role;
grant execute on function public.classstatus_production_list_collector_logs(
  integer, uuid, uuid
) to service_role;

create function public.classstatus_production_append_audit(
  p_action text,
  p_outcome text,
  p_record_id text default null,
  p_target_summary text default null,
  p_correlation_id text default null,
  p_reason_code text default null,
  p_effective_at timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.append_audit(
    'production', p_action, p_outcome, p_record_id, p_target_summary,
    p_correlation_id, p_reason_code, p_effective_at
  );
$$;

create function public.classstatus_production_list_audit(
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.list_audit('production', p_limit, p_offset);
$$;

create function public.classstatus_production_upsert_collected(
  p_record jsonb,
  p_event_key text,
  p_conflict_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.upsert_collected(
    'production', p_record, p_event_key, p_conflict_key
  );
$$;

create function public.classstatus_production_append_collector_logs(p_logs jsonb)
returns boolean
language sql
security definer
set search_path = ''
as $$ select classstatus_private.append_collector_logs('production', p_logs); $$;

create function public.classstatus_production_list_collector_logs(
  p_limit integer default 200
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select classstatus_private.list_collector_logs('production', p_limit); $$;

revoke execute on function public.classstatus_production_start_admin_session(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_touch_admin_session(boolean)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_revoke_admin_session()
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_admin_snapshot()
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_create_confirmation(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_publish_manual(jsonb, uuid, text, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_mutate_lifecycle(text, text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_reconcile_removals()
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_append_audit(text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_audit(integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_upsert_collected(jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_append_collector_logs(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_collector_logs(integer)
  from public, anon, authenticated, service_role;

grant execute on function public.classstatus_production_start_admin_session(text, text)
  to authenticated;
grant execute on function public.classstatus_production_touch_admin_session(boolean)
  to authenticated;
grant execute on function public.classstatus_production_revoke_admin_session()
  to authenticated;
grant execute on function public.classstatus_production_admin_snapshot()
  to authenticated;
grant execute on function public.classstatus_production_create_confirmation(uuid, text)
  to authenticated;
grant execute on function public.classstatus_production_publish_manual(jsonb, uuid, text, text, uuid, text)
  to authenticated;
grant execute on function public.classstatus_production_mutate_lifecycle(text, text, bigint, uuid, text)
  to authenticated;
grant execute on function public.classstatus_production_reconcile_removals()
  to authenticated;
grant execute on function public.classstatus_production_append_audit(text, text, text, text, text, text, timestamptz)
  to authenticated;
grant execute on function public.classstatus_production_list_audit(integer, integer)
  to authenticated;
grant execute on function public.classstatus_production_upsert_collected(jsonb, text, text)
  to authenticated;
grant execute on function public.classstatus_production_append_collector_logs(jsonb)
  to authenticated;
grant execute on function public.classstatus_production_list_collector_logs(integer)
  to authenticated;

-- The lease wrapper has one shared signature. Keep service-role access only for
-- rollback and add authenticated access for the new manual Production collector.
revoke execute on function public.classstatus_production_acquire_collector_lease(uuid)
  from public, anon;
revoke execute on function public.classstatus_production_release_collector_lease(uuid)
  from public, anon;
grant execute on function public.classstatus_production_acquire_collector_lease(uuid)
  to authenticated, service_role;
grant execute on function public.classstatus_production_release_collector_lease(uuid)
  to authenticated, service_role;

create function public.classstatus_production_worker_acquire_collector_lease(
  p_payload text,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text
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
  payload := classstatus_private.verify_production_collector_capability(
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
  perform pg_catalog.set_config('classstatus.collector_worker', 'production', true);
  return classstatus_private.acquire_collector_lease(
    'production', owner_token_text::uuid
  );
end
$$;

create function public.classstatus_production_worker_release_collector_lease(
  p_payload text,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text
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
  payload := classstatus_private.verify_production_collector_capability(
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
  perform pg_catalog.set_config('classstatus.collector_worker', 'production', true);
  return classstatus_private.release_collector_lease(
    'production', owner_token_text::uuid
  );
end
$$;

create function public.classstatus_production_worker_upsert_collected(
  p_payload text,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := classstatus_private.verify_production_collector_capability(
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
  perform pg_catalog.set_config('classstatus.collector_worker', 'production', true);
  return classstatus_private.upsert_collected(
    'production', payload -> 'record', payload ->> 'eventKey', payload ->> 'conflictKey'
  );
end
$$;

create function public.classstatus_production_worker_append_collector_logs(
  p_payload text,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text
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
    'logs.append', p_payload, p_issued_at, p_nonce, p_signature, 1048576
  );
  if pg_catalog.jsonb_typeof(payload) <> 'object'
     or not (payload ? 'logs')
     or payload - 'logs' <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(payload -> 'logs') <> 'array'
  then
    raise exception 'classstatus:collector-proof-payload-invalid';
  end if;
  perform pg_catalog.set_config('classstatus.collector_worker', 'production', true);
  return classstatus_private.append_collector_logs('production', payload -> 'logs');
end
$$;

revoke execute on function public.classstatus_production_worker_acquire_collector_lease(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_worker_release_collector_lease(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_worker_upsert_collected(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_worker_append_collector_logs(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.classstatus_production_worker_acquire_collector_lease(text, bigint, uuid, text)
  to anon;
grant execute on function public.classstatus_production_worker_release_collector_lease(text, bigint, uuid, text)
  to anon;
grant execute on function public.classstatus_production_worker_upsert_collected(text, bigint, uuid, text)
  to anon;
grant execute on function public.classstatus_production_worker_append_collector_logs(text, bigint, uuid, text)
  to anon;

revoke execute on all functions in schema classstatus_private
  from public, anon, authenticated, service_role;
