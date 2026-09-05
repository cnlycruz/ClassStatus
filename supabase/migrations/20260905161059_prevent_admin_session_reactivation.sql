-- Access JWTs remain cryptographically valid after Supabase sign-out. Require
-- their current Auth session at the database boundary, including direct RPCs.
-- No Auth tables are mutated and no runtime secret/service-role is introduced.
create or replace function classstatus_private.assert_authenticated_principal(p_namespace text)
returns table(admin_user_id uuid, admin_session_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_session uuid;
begin
  if p_namespace is null or p_namespace not in ('preview', 'production')
     or caller_id is null or (select auth.jwt() ->> 'role') is distinct from 'authenticated'
  then
    raise exception 'classstatus:unauthenticated';
  end if;
  caller_session := classstatus_private.jwt_session_id();
  if not exists (
    select 1 from public.classstatus_admin_principals principal
    where principal.deployment_namespace = p_namespace
      and principal.user_id = caller_id and principal.enabled
  ) then
    raise exception 'classstatus:forbidden';
  end if;
  if not exists (
    select 1 from auth.sessions session
    where session.id = caller_session and session.user_id = caller_id
      and (session.not_after is null or session.not_after > clock_timestamp())
  ) then
    raise exception 'classstatus:session-invalid';
  end if;
  return query select caller_id, caller_session;
end
$$;

-- Starting a guard must not revive an expired/revoked/replaced login or renew
-- its absolute lifetime. Fresh password authentication produces a new Auth
-- session; repeated RPCs from one still-current login are only idempotent reads.
create or replace function classstatus_private.start_admin_session(
  p_namespace text,
  p_csrf_digest text,
  p_login_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  guard public.classstatus_admin_session_guards%rowtype;
  session_created_at timestamptz;
  now_at timestamptz := clock_timestamp();
  absolute_at timestamptz := now_at + interval '8 hours';
begin
  if p_csrf_digest is null or p_csrf_digest !~ '^[0-9a-f]{64}$'
     or p_login_fingerprint is null or p_login_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'classstatus:session-invalid';
  end if;
  select * into context
  from classstatus_private.assert_authenticated_principal(p_namespace);

  -- Serialize even the first guard creation, when no row exists to lock yet.
  perform pg_advisory_xact_lock(hashtextextended('classstatus-admin-login:' || p_namespace, 0));
  select * into guard from public.classstatus_admin_session_guards current_guard
  where current_guard.deployment_namespace = p_namespace for update;

  if guard.supabase_session_id = context.admin_session_id then
    if guard.revoked_at is not null or guard.absolute_expires_at <= now_at
       or guard.last_seen_at <= now_at - interval '30 minutes'
       or guard.csrf_digest <> p_csrf_digest
    then
      raise exception 'classstatus:session-invalid';
    end if;
    return jsonb_build_object(
      'sessionId', guard.supabase_session_id,
      'absoluteExpiresAt', guard.absolute_expires_at,
      'idleExpiresAt', guard.last_seen_at + interval '30 minutes'
    );
  end if;

  select session.created_at into session_created_at from auth.sessions session
  where session.id = context.admin_session_id and session.user_id = context.admin_user_id;
  if session_created_at is null
     or (guard.created_at is not null and session_created_at <= guard.created_at)
  then
    raise exception 'classstatus:session-invalid';
  end if;

  insert into public.classstatus_admin_session_guards (
    deployment_namespace, admin_user_id, supabase_session_id, csrf_digest,
    created_at, last_seen_at, absolute_expires_at, revoked_at
  ) values (
    p_namespace, context.admin_user_id, context.admin_session_id, p_csrf_digest,
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
  where throttle.deployment_namespace = p_namespace
    and throttle.fingerprint = p_login_fingerprint;

  return jsonb_build_object(
    'sessionId', context.admin_session_id,
    'absoluteExpiresAt', absolute_at,
    'idleExpiresAt', now_at + interval '30 minutes'
  );
end
$$;

revoke execute on function classstatus_private.assert_authenticated_principal(text)
  from public, anon, authenticated, service_role;
revoke execute on function classstatus_private.start_admin_session(text, text, text)
  from public, anon, authenticated, service_role;
