-- Anonymous callers could invoke record_login_failure directly and increment
-- the predictable global bucket without making an Auth attempt. Remove the
-- paired hosted check endpoint as well: Supabase Auth remains the authoritative
-- hosted sign-in throttle; local JSON retains its private application-level
-- throttle.
revoke execute on function public.classstatus_preview_check_login_throttle(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_check_login_throttle(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_record_login_failure(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_record_login_failure(text)
  from public, anon, authenticated, service_role;
drop function public.classstatus_preview_check_login_throttle(text);
drop function public.classstatus_production_check_login_throttle(text);
drop function public.classstatus_preview_record_login_failure(text);
drop function public.classstatus_production_record_login_failure(text);

delete from public.classstatus_login_throttles;

-- Preview and Production currently share a Supabase Auth project and one
-- immutable administrator UUID. Production session-guard writes therefore
-- cannot be exposed to an authenticated JWT: that JWT is not namespace-bound.
-- Route them through the production-only server secret just like all other
-- production mutations, while retaining the verified user/session pair.
create or replace function classstatus_private.assert_production_service_principal(
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns table(admin_user_id uuid, admin_session_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'role') <> 'service_role'
     or p_admin_user_id is null
     or p_admin_session_id is null
     or not exists (
       select 1
       from public.classstatus_admin_principals principal
       where principal.deployment_namespace = 'production'
         and principal.user_id = p_admin_user_id
         and principal.enabled
     )
  then
    raise exception 'classstatus:forbidden';
  end if;

  return query select p_admin_user_id, p_admin_session_id;
end
$$;

create or replace function classstatus_private.start_production_admin_session(
  p_csrf_digest text,
  p_login_fingerprint text,
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  now_at timestamptz := clock_timestamp();
  absolute_at timestamptz := now_at + interval '8 hours';
begin
  if p_csrf_digest !~ '^[0-9a-f]{64}$'
     or p_login_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'classstatus:session-invalid';
  end if;

  select * into context
  from classstatus_private.assert_production_service_principal(
    p_admin_user_id, p_admin_session_id
  );

  insert into public.classstatus_admin_session_guards (
    deployment_namespace, admin_user_id, supabase_session_id, csrf_digest,
    created_at, last_seen_at, absolute_expires_at, revoked_at
  )
  values (
    'production', context.admin_user_id, context.admin_session_id, p_csrf_digest,
    now_at, now_at, absolute_at, null
  )
  on conflict (deployment_namespace) do update
  set admin_user_id = excluded.admin_user_id,
      supabase_session_id = excluded.supabase_session_id,
      csrf_digest = excluded.csrf_digest,
      created_at = excluded.created_at,
      last_seen_at = excluded.last_seen_at,
      absolute_expires_at = excluded.absolute_expires_at,
      revoked_at = null;

  delete from public.classstatus_login_throttles throttle
  where throttle.deployment_namespace = 'production'
    and throttle.fingerprint = p_login_fingerprint;

  return jsonb_build_object(
    'sessionId', context.admin_session_id,
    'absoluteExpiresAt', absolute_at,
    'idleExpiresAt', now_at + interval '30 minutes'
  );
end
$$;

create or replace function classstatus_private.touch_production_admin_session(
  p_touch boolean,
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  guard record;
  now_at timestamptz := clock_timestamp();
begin
  select * into context
  from classstatus_private.assert_production_service_principal(
    p_admin_user_id, p_admin_session_id
  );

  update public.classstatus_admin_session_guards current_guard
  set last_seen_at = case
    when p_touch and current_guard.last_seen_at < now_at - interval '1 minute' then now_at
    else current_guard.last_seen_at
  end
  where current_guard.deployment_namespace = 'production'
    and current_guard.admin_user_id = context.admin_user_id
    and current_guard.supabase_session_id = context.admin_session_id
    and current_guard.revoked_at is null
    and current_guard.absolute_expires_at > now_at
    and current_guard.last_seen_at > now_at - interval '30 minutes'
  returning * into guard;

  if guard is null then
    raise exception 'classstatus:session-invalid';
  end if;

  return jsonb_build_object(
    'sessionId', guard.supabase_session_id,
    'csrfDigest', guard.csrf_digest,
    'absoluteExpiresAt', guard.absolute_expires_at,
    'idleExpiresAt', guard.last_seen_at + interval '30 minutes'
  );
end
$$;

create or replace function classstatus_private.revoke_production_admin_session(
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
begin
  select * into context
  from classstatus_private.assert_production_service_principal(
    p_admin_user_id, p_admin_session_id
  );

  update public.classstatus_admin_session_guards guard
  set revoked_at = clock_timestamp()
  where guard.deployment_namespace = 'production'
    and guard.admin_user_id = context.admin_user_id
    and guard.supabase_session_id = context.admin_session_id
    and guard.revoked_at is null;

  if not found then
    raise exception 'classstatus:session-invalid';
  end if;
  return true;
end
$$;

revoke execute on function public.classstatus_production_start_admin_session(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_touch_admin_session(boolean)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_revoke_admin_session()
  from public, anon, authenticated, service_role;
drop function public.classstatus_production_start_admin_session(text, text);
drop function public.classstatus_production_touch_admin_session(boolean);
drop function public.classstatus_production_revoke_admin_session();

create function public.classstatus_production_start_admin_session(
  p_csrf_digest text,
  p_login_fingerprint text,
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.start_production_admin_session(
    p_csrf_digest, p_login_fingerprint, p_admin_user_id, p_admin_session_id
  );
$$;

create function public.classstatus_production_touch_admin_session(
  p_touch boolean,
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.touch_production_admin_session(
    p_touch, p_admin_user_id, p_admin_session_id
  );
$$;

create function public.classstatus_production_revoke_admin_session(
  p_admin_user_id uuid,
  p_admin_session_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select classstatus_private.revoke_production_admin_session(
    p_admin_user_id, p_admin_session_id
  );
$$;

revoke execute on function public.classstatus_production_start_admin_session(text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_touch_admin_session(boolean, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_revoke_admin_session(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.classstatus_production_start_admin_session(text, text, uuid, uuid)
  to service_role;
grant execute on function public.classstatus_production_touch_admin_session(boolean, uuid, uuid)
  to service_role;
grant execute on function public.classstatus_production_revoke_admin_session(uuid, uuid)
  to service_role;

revoke execute on all functions in schema classstatus_private
  from public, anon, authenticated, service_role;
