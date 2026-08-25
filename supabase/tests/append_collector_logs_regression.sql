-- Run against a migrated database. Every mutation is rolled back.
begin;

do $regression$
declare
  test_user_id uuid;
  test_session_id uuid := gen_random_uuid();
  first_run_id text := 'collector-regression-first-' || gen_random_uuid()::text;
  second_run_id text := 'collector-regression-second-' || gen_random_uuid()::text;
  started_at timestamptz := clock_timestamp() - interval '1 minute';
  expected_completed_at timestamptz := clock_timestamp();
  initial_logs jsonb;
  updated_logs jsonb;
  second_logs jsonb;
  persisted_started_at timestamptz;
begin
  select principal.user_id into test_user_id
  from public.classstatus_admin_principals principal
  where principal.deployment_namespace = 'production'
    and principal.enabled
  order by principal.created_at
  limit 1;

  if test_user_id is null then
    raise exception 'collector regression requires an enabled Production admin principal';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );

  insert into public.classstatus_admin_session_guards (
    deployment_namespace,
    admin_user_id,
    supabase_session_id,
    csrf_digest,
    created_at,
    last_seen_at,
    absolute_expires_at,
    revoked_at
  )
  values (
    'production',
    test_user_id,
    test_session_id,
    repeat('a', 64),
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp() + interval '1 hour',
    null
  )
  on conflict (deployment_namespace) do update
  set admin_user_id = excluded.admin_user_id,
      supabase_session_id = excluded.supabase_session_id,
      csrf_digest = excluded.csrf_digest,
      created_at = excluded.created_at,
      last_seen_at = excluded.last_seen_at,
      absolute_expires_at = excluded.absolute_expires_at,
      revoked_at = null;

  initial_logs := jsonb_build_array(
    jsonb_build_object(
      'runId', first_run_id,
      'timestamp', started_at,
      'message', 'Sweep started'
    )
  );
  updated_logs := initial_logs || jsonb_build_array(
    jsonb_build_object(
      'runId', first_run_id,
      'timestamp', expected_completed_at,
      'message', 'Sweep complete: 1 record stored'
    )
  );
  second_logs := jsonb_build_array(
    jsonb_build_object(
      'runId', second_run_id,
      'timestamp', started_at + interval '1 second',
      'message', 'Sweep started'
    ),
    jsonb_build_object(
      'runId', second_run_id,
      'timestamp', expected_completed_at + interval '1 second',
      'message', 'Sweep complete: 0 records stored'
    )
  );

  if not classstatus_private.append_collector_logs(
    'production', initial_logs, test_user_id, test_session_id
  ) then
    raise exception 'first collector append did not return true';
  end if;

  select run.started_at into persisted_started_at
  from public.classstatus_collector_runs run
  where run.deployment_namespace = 'production'
    and run.run_id = first_run_id;

  if persisted_started_at is distinct from started_at then
    raise exception 'first collector append did not persist started_at';
  end if;

  if not classstatus_private.append_collector_logs(
    'production', updated_logs, test_user_id, test_session_id
  ) then
    raise exception 'same-run collector upsert did not return true';
  end if;

  if (
    select count(*)
    from public.classstatus_collector_runs run
    where run.deployment_namespace = 'production'
      and run.run_id = first_run_id
  ) <> 1 then
    raise exception 'same-run collector upsert duplicated the primary-key row';
  end if;

  if not exists (
    select 1
    from public.classstatus_collector_runs run
    where run.deployment_namespace = 'production'
      and run.run_id = first_run_id
      and run.started_at = persisted_started_at
      and run.completed_at = expected_completed_at
      and run.logs = updated_logs
      and run.summary = jsonb_build_object(
        'message', 'Sweep complete: 1 record stored'
      )
  ) then
    raise exception 'same-run collector upsert did not update completion data';
  end if;

  if not classstatus_private.append_collector_logs(
    'production', second_logs, test_user_id, test_session_id
  ) then
    raise exception 'second collector append did not return true';
  end if;

  if (
    select count(*)
    from public.classstatus_collector_runs run
    where run.deployment_namespace = 'production'
      and run.run_id in (first_run_id, second_run_id)
  ) <> 2 then
    raise exception 'distinct collector run IDs did not create independent rows';
  end if;

  if exists (
    select 1
    from public.classstatus_collector_runs run
    where run.deployment_namespace = 'preview'
      and run.run_id in (first_run_id, second_run_id)
  ) then
    raise exception 'Production collector writes crossed into Preview';
  end if;
end
$regression$;

rollback;
