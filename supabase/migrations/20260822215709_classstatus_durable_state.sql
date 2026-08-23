-- ClassStatus durable state. One project is shared initially, so every durable
-- row is partitioned by an immutable deployment namespace.

create schema if not exists classstatus_private;
revoke all on schema classstatus_private from public, anon, authenticated;

create table public.classstatus_admin_principals (
  deployment_namespace text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  primary key (deployment_namespace, user_id),
  constraint classstatus_admin_principals_namespace_check
    check (deployment_namespace in ('preview', 'production'))
);

create table public.classstatus_suspensions (
  deployment_namespace text not null,
  record_id text not null,
  record jsonb not null,
  event_key text not null,
  conflict_key text not null,
  provenance_type text not null,
  administrative_state text not null default 'active',
  revision bigint not null default 1,
  undo_deadline timestamptz,
  removal_finalized_at timestamptz,
  published_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (deployment_namespace, record_id),
  constraint classstatus_suspensions_namespace_check
    check (deployment_namespace in ('preview', 'production')),
  constraint classstatus_suspensions_record_object_check
    check (jsonb_typeof(record) = 'object' and record ->> 'id' = record_id),
  constraint classstatus_suspensions_event_key_check
    check (event_key ~ '^[0-9a-f]{64}$'),
  constraint classstatus_suspensions_provenance_check
    check (provenance_type in ('manual-admin', 'automatic-collector')),
  constraint classstatus_suspensions_state_check
    check (administrative_state in ('active', 'pending_removal', 'removed')),
  constraint classstatus_suspensions_revision_check
    check (revision > 0),
  constraint classstatus_suspensions_pending_deadline_check
    check (administrative_state <> 'pending_removal' or undo_deadline is not null)
);

create unique index classstatus_suspensions_live_event_uidx
  on public.classstatus_suspensions (deployment_namespace, event_key)
  where administrative_state in ('active', 'pending_removal');
create index classstatus_suspensions_public_idx
  on public.classstatus_suspensions (deployment_namespace, administrative_state, published_at desc);
create index classstatus_suspensions_conflict_idx
  on public.classstatus_suspensions (deployment_namespace, conflict_key)
  where administrative_state = 'active';
create index classstatus_suspensions_undo_idx
  on public.classstatus_suspensions (deployment_namespace, undo_deadline)
  where administrative_state = 'pending_removal';

create table public.classstatus_audit_entries (
  deployment_namespace text not null,
  audit_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_user_id uuid,
  actor_session_id uuid,
  action text not null,
  outcome text not null,
  record_id text,
  target_summary text,
  correlation_id text,
  reason_code text,
  effective_at timestamptz,
  primary key (deployment_namespace, audit_id),
  constraint classstatus_audit_namespace_check
    check (deployment_namespace in ('preview', 'production')),
  constraint classstatus_audit_outcome_check
    check (outcome in ('success', 'failure'))
);
create index classstatus_audit_recent_idx
  on public.classstatus_audit_entries (deployment_namespace, occurred_at desc);
create index classstatus_audit_record_idx
  on public.classstatus_audit_entries (deployment_namespace, record_id, occurred_at desc)
  where record_id is not null;

create table public.classstatus_confirmation_receipts (
  deployment_namespace text not null,
  confirmation_id uuid not null,
  admin_user_id uuid not null,
  admin_session_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  primary key (deployment_namespace, confirmation_id),
  constraint classstatus_confirmation_namespace_check
    check (deployment_namespace in ('preview', 'production')),
  constraint classstatus_confirmation_hash_check
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint classstatus_confirmation_expiry_check
    check (expires_at > created_at)
);
create index classstatus_confirmation_session_idx
  on public.classstatus_confirmation_receipts
  (deployment_namespace, admin_session_id, expires_at desc);

create table public.classstatus_idempotency_receipts (
  deployment_namespace text not null,
  idempotency_key uuid not null,
  admin_user_id uuid not null,
  admin_session_id uuid not null,
  operation text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (deployment_namespace, idempotency_key, admin_session_id, operation),
  constraint classstatus_idempotency_namespace_check
    check (deployment_namespace in ('preview', 'production')),
  constraint classstatus_idempotency_operation_check
    check (operation in ('publish', 'remove', 'undo')),
  constraint classstatus_idempotency_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$')
);
create index classstatus_idempotency_expiry_idx
  on public.classstatus_idempotency_receipts (deployment_namespace, created_at);

-- This table supplements Supabase Auth. It deliberately stores no password,
-- refresh token, access token, or custom bearer credential.
create table public.classstatus_admin_session_guards (
  deployment_namespace text primary key,
  admin_user_id uuid not null,
  supabase_session_id uuid not null,
  csrf_digest text not null,
  created_at timestamptz not null,
  last_seen_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint classstatus_session_namespace_check
    check (deployment_namespace in ('preview', 'production')),
  constraint classstatus_session_csrf_check
    check (csrf_digest ~ '^[0-9a-f]{64}$'),
  constraint classstatus_session_expiry_check
    check (absolute_expires_at > created_at),
  constraint classstatus_session_principal_fkey
    foreign key (deployment_namespace, admin_user_id)
    references public.classstatus_admin_principals (deployment_namespace, user_id)
    on delete cascade
);
create index classstatus_session_user_idx
  on public.classstatus_admin_session_guards (deployment_namespace, admin_user_id);

create table public.classstatus_login_throttles (
  deployment_namespace text not null,
  fingerprint text not null,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default clock_timestamp(),
  last_failure_at timestamptz,
  lock_until timestamptz,
  backoff_level integer not null default 0,
  primary key (deployment_namespace, fingerprint),
  constraint classstatus_throttle_namespace_check
    check (deployment_namespace in ('preview', 'production')),
  constraint classstatus_throttle_fingerprint_check
    check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint classstatus_throttle_counts_check
    check (failure_count >= 0 and backoff_level between 0 and 4)
);
create index classstatus_throttle_cleanup_idx
  on public.classstatus_login_throttles (deployment_namespace, window_started_at);

create table public.classstatus_collector_runs (
  deployment_namespace text not null,
  run_id text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  logs jsonb not null,
  summary jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (deployment_namespace, run_id),
  constraint classstatus_collector_namespace_check
    check (deployment_namespace in ('preview', 'production')),
  constraint classstatus_collector_logs_check
    check (jsonb_typeof(logs) = 'array')
);
create index classstatus_collector_recent_idx
  on public.classstatus_collector_runs (deployment_namespace, started_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'classstatus_admin_principals',
    'classstatus_suspensions',
    'classstatus_audit_entries',
    'classstatus_confirmation_receipts',
    'classstatus_idempotency_receipts',
    'classstatus_admin_session_guards',
    'classstatus_login_throttles',
    'classstatus_collector_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end
$$;

create or replace function classstatus_private.jwt_session_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  value text;
begin
  value := (select auth.jwt() ->> 'session_id');
  if value is null or value !~* '^[0-9a-f-]{36}$' then
    raise exception 'classstatus:unauthenticated';
  end if;
  return value::uuid;
end
$$;

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
  if p_namespace not in ('preview', 'production') or caller_id is null then
    raise exception 'classstatus:unauthenticated';
  end if;
  caller_session := classstatus_private.jwt_session_id();
  if not exists (
    select 1
    from public.classstatus_admin_principals principal
    where principal.deployment_namespace = p_namespace
      and principal.user_id = caller_id
      and principal.enabled
  ) then
    raise exception 'classstatus:forbidden';
  end if;
  return query select caller_id, caller_session;
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

create or replace function classstatus_private.insert_audit(
  p_namespace text,
  p_admin_user_id uuid,
  p_admin_session_id uuid,
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
  with inserted as (
    insert into public.classstatus_audit_entries (
      deployment_namespace, actor_user_id, actor_session_id, action, outcome,
      record_id, target_summary, correlation_id, reason_code, effective_at
    )
    values (
      p_namespace, p_admin_user_id, p_admin_session_id, p_action, p_outcome,
      p_record_id, p_target_summary, p_correlation_id, p_reason_code, p_effective_at
    )
    returning *
  )
  select jsonb_build_object(
    'id', audit_id,
    'timestamp', occurred_at,
    'action', action,
    'outcome', outcome,
    'recordId', record_id,
    'targetSummary', target_summary,
    'correlationId', correlation_id,
    'reasonCode', reason_code,
    'effectiveAt', effective_at
  )
  from inserted;
$$;

revoke execute on all functions in schema classstatus_private from public, anon, authenticated;

create or replace function classstatus_private.mutate_lifecycle(
  p_namespace text,
  p_operation text,
  p_record_id text,
  p_expected_revision bigint,
  p_idempotency_key uuid,
  p_request_hash text,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  prior record;
  current_record record;
  updated_record jsonb;
  now_at timestamptz := clock_timestamp();
  deadline_at timestamptz;
begin
  if p_operation not in ('remove', 'undo')
     or p_expected_revision < 1
     or p_request_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'classstatus:invalid-state-transition';
  end if;

  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  perform pg_advisory_xact_lock(hashtextextended(
    p_namespace || ':' || p_idempotency_key::text || ':' || context.admin_session_id::text || ':' || p_operation,
    0
  ));

  delete from public.classstatus_idempotency_receipts receipt
  where receipt.deployment_namespace = p_namespace
    and receipt.created_at < now_at - interval '24 hours';

  select * into prior
  from public.classstatus_idempotency_receipts receipt
  where receipt.deployment_namespace = p_namespace
    and receipt.idempotency_key = p_idempotency_key
    and receipt.admin_session_id = context.admin_session_id
    and receipt.operation = p_operation;
  if prior is not null then
    if prior.request_hash <> p_request_hash then
      raise exception 'classstatus:idempotency-conflict';
    end if;
    return prior.response;
  end if;

  if p_operation = 'remove' then
    deadline_at := now_at + interval '30 seconds';
    update public.classstatus_suspensions suspension
    set administrative_state = 'pending_removal',
        revision = suspension.revision + 1,
        undo_deadline = deadline_at,
        updated_at = now_at,
        record = (
          suspension.record
            - 'removalFinalizedAt'
            || jsonb_build_object(
              'administrativeState', 'pending_removal',
              'removalRequestedAt', now_at,
              'undoDeadline', deadline_at,
              'revision', suspension.revision + 1
            )
        )
    where suspension.deployment_namespace = p_namespace
      and suspension.record_id = p_record_id
      and suspension.revision = p_expected_revision
      and suspension.administrative_state = 'active'
    returning suspension.record into updated_record;
  else
    update public.classstatus_suspensions suspension
    set administrative_state = 'active',
        revision = suspension.revision + 1,
        undo_deadline = null,
        updated_at = now_at,
        record = (
          suspension.record
            - 'removalRequestedAt'
            - 'undoDeadline'
            - 'removalFinalizedAt'
            || jsonb_build_object(
              'administrativeState', 'active',
              'revision', suspension.revision + 1
            )
        )
    where suspension.deployment_namespace = p_namespace
      and suspension.record_id = p_record_id
      and suspension.revision = p_expected_revision
      and suspension.administrative_state = 'pending_removal'
      and suspension.undo_deadline > now_at
    returning suspension.record into updated_record;
  end if;

  if updated_record is null then
    select * into current_record
    from public.classstatus_suspensions suspension
    where suspension.deployment_namespace = p_namespace
      and suspension.record_id = p_record_id;
    if current_record is null then
      raise exception 'classstatus:record-not-found';
    elsif current_record.revision <> p_expected_revision then
      raise exception 'classstatus:stale-revision';
    elsif p_operation = 'undo'
      and current_record.administrative_state = 'pending_removal'
      and current_record.undo_deadline <= now_at
    then
      raise exception 'classstatus:undo-window-expired';
    else
      raise exception 'classstatus:invalid-state-transition';
    end if;
  end if;

  perform classstatus_private.insert_audit(
    p_namespace, context.admin_user_id, context.admin_session_id,
    case when p_operation = 'remove' then 'removal-request' else 'removal-undo' end,
    'success', p_record_id,
    coalesce(updated_record ->> 'schoolId', updated_record ->> 'lguId'),
    p_idempotency_key::text
  );

  insert into public.classstatus_idempotency_receipts (
    deployment_namespace, idempotency_key, admin_user_id, admin_session_id,
    operation, request_hash, response
  )
  values (
    p_namespace, p_idempotency_key, context.admin_user_id, context.admin_session_id,
    p_operation, p_request_hash, updated_record
  );
  return updated_record;
end
$$;

create or replace function classstatus_private.reconcile_removals(
  p_namespace text,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  finalized record;
  now_at timestamptz := clock_timestamp();
  finalized_count integer := 0;
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  for finalized in
    update public.classstatus_suspensions suspension
    set administrative_state = 'removed',
        removal_finalized_at = now_at,
        revision = suspension.revision + 1,
        updated_at = now_at,
        record = suspension.record || jsonb_build_object(
          'administrativeState', 'removed',
          'removalFinalizedAt', now_at,
          'revision', suspension.revision + 1
        )
    where suspension.deployment_namespace = p_namespace
      and suspension.administrative_state = 'pending_removal'
      and suspension.undo_deadline <= now_at
    returning suspension.record_id, suspension.record, suspension.undo_deadline
  loop
    finalized_count := finalized_count + 1;
    perform classstatus_private.insert_audit(
      p_namespace, context.admin_user_id, context.admin_session_id,
      'removal-finalized', 'success', finalized.record_id,
      coalesce(finalized.record ->> 'schoolId', finalized.record ->> 'lguId'),
      null, null, finalized.undo_deadline
    );
  end loop;
  return finalized_count;
end
$$;

create or replace function classstatus_private.upsert_collected(
  p_namespace text,
  p_record jsonb,
  p_event_key text,
  p_conflict_key text,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  duplicate_manual record;
  conflicting record;
  existing record;
  preferred jsonb;
  sources jsonb;
  verified_sources jsonb;
  merged jsonb;
  confidence text;
  same_outlet boolean;
  action_name text;
begin
  if jsonb_typeof(p_record) <> 'object'
     or p_event_key !~ '^[0-9a-f]{64}$'
     or p_record ->> 'eventKey' <> p_event_key
     or p_record #>> '{publicationProvenance,type}' <> 'automatic-collector'
     or p_record #>> '{collectorProvenance,pipeline}' <> 'tier3-media'
     or p_record #>> '{source,id}' not in ('rappler-walang-pasok', 'gma-news-walang-pasok')
     or coalesce((p_record #>> '{source,reliabilityTier}')::integer, 0) <> 3
  then
    raise exception 'classstatus:collector-policy-rejected';
  end if;

  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  perform pg_advisory_xact_lock(hashtextextended(p_namespace || ':' || p_event_key, 0));

  select * into duplicate_manual
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = p_namespace
    and suspension.event_key = p_event_key
    and suspension.provenance_type = 'manual-admin'
    and suspension.administrative_state = 'active'
  limit 1;
  if duplicate_manual is not null then
    return jsonb_build_object(
      'action', 'held',
      'record', p_record,
      'reason', 'duplicates-manual:' || duplicate_manual.record_id
    );
  end if;

  select * into conflicting
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = p_namespace
    and suspension.conflict_key = p_conflict_key
    and suspension.administrative_state = 'active'
    and suspension.record ->> 'status' <> p_record ->> 'status'
  order by suspension.updated_at desc
  limit 1;
  if conflicting is not null then
    return jsonb_build_object(
      'action', 'held',
      'record', p_record,
      'reason', 'conflicts-with:' || conflicting.record_id
    );
  end if;

  select * into existing
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = p_namespace
    and suspension.event_key = p_event_key
    and suspension.provenance_type = 'automatic-collector'
  order by suspension.updated_at desc
  limit 1
  for update;

  if existing is null then
    insert into public.classstatus_suspensions (
      deployment_namespace, record_id, record, event_key, conflict_key,
      provenance_type, administrative_state, revision, published_at
    )
    values (
      p_namespace, p_record ->> 'id', p_record, p_event_key, p_conflict_key,
      'automatic-collector', 'active', coalesce((p_record ->> 'revision')::bigint, 1),
      (p_record ->> 'publishedAt')::timestamptz
    );
    return jsonb_build_object('action', 'created', 'record', p_record);
  end if;

  if existing.administrative_state <> 'active' then
    return jsonb_build_object(
      'action', 'held',
      'record', p_record,
      'reason', 'administratively-removed:' || existing.record_id
    );
  end if;

  preferred := case
    when (p_record ->> 'publishedAt')::timestamptz > existing.published_at then p_record
    else existing.record
  end;
  sources :=
    jsonb_build_array(preferred -> 'source', existing.record -> 'source')
    || coalesce(existing.record -> 'additionalSources', '[]'::jsonb)
    || jsonb_build_array(p_record -> 'source');

  with source_rows as (
    select source.value, source.ordinality,
      lower(source.value ->> 'organization') || '|' || (source.value ->> 'url') as identity
    from jsonb_array_elements(sources) with ordinality source(value, ordinality)
  ),
  deduplicated as (
    select distinct on (identity) value, ordinality
    from source_rows
    order by identity, ordinality
  )
  select
    case when count(distinct lower(value ->> 'organization')) >= 2 then 'high' else 'medium' end,
    jsonb_agg(value order by ordinality)
  into confidence, sources
  from deduplicated;

  select jsonb_agg(
    source.value || jsonb_build_object('verified', confidence = 'high')
    order by source.ordinality
  )
  into verified_sources
  from jsonb_array_elements(sources) with ordinality source(value, ordinality);

  select exists (
    select 1
    from jsonb_array_elements(
      jsonb_build_array(existing.record -> 'source')
      || coalesce(existing.record -> 'additionalSources', '[]'::jsonb)
    ) source(value)
    where source.value ->> 'organization' = p_record #>> '{source,organization}'
      and source.value ->> 'url' = p_record #>> '{source,url}'
  ) into same_outlet;

  merged := preferred || jsonb_build_object(
    'id', existing.record_id,
    'eventKey', p_event_key,
    'source', verified_sources -> 0,
    'additionalSources', coalesce(verified_sources - 0, '[]'::jsonb),
    'confidence', confidence,
    'publicationProvenance', jsonb_build_object(
      'type', 'automatic-collector',
      'publicLabel', 'Published from approved Tier 3 media evidence'
    ),
    'administrativeState', 'active',
    'revision', existing.revision + 1
  );
  action_name := case when same_outlet then 'updated' else 'merged' end;

  update public.classstatus_suspensions suspension
  set record = merged,
      conflict_key = p_conflict_key,
      revision = existing.revision + 1,
      published_at = (merged ->> 'publishedAt')::timestamptz,
      updated_at = clock_timestamp()
  where suspension.deployment_namespace = p_namespace
    and suspension.record_id = existing.record_id
    and suspension.revision = existing.revision;
  if not found then
    raise exception 'classstatus:stale-revision';
  end if;

  return jsonb_build_object('action', action_name, 'record', merged);
end
$$;

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
  run_id text;
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  if jsonb_typeof(p_logs) <> 'array' or jsonb_array_length(p_logs) = 0 or jsonb_array_length(p_logs) > 500 then
    raise exception 'classstatus:collector-log-invalid';
  end if;
  first_log := p_logs -> 0;
  last_log := p_logs -> (jsonb_array_length(p_logs) - 1);
  run_id := first_log ->> 'runId';
  if run_id is null or length(run_id) > 128 or exists (
    select 1 from jsonb_array_elements(p_logs) item
    where item ->> 'runId' <> run_id
  ) then
    raise exception 'classstatus:collector-log-invalid';
  end if;

  insert into public.classstatus_collector_runs (
    deployment_namespace, run_id, started_at, completed_at, logs, summary
  )
  values (
    p_namespace,
    run_id,
    (first_log ->> 'timestamp')::timestamptz,
    case when last_log ->> 'message' like 'Sweep complete:%'
      then (last_log ->> 'timestamp')::timestamptz else null end,
    p_logs,
    case when last_log ->> 'message' like 'Sweep complete:%'
      then jsonb_build_object('message', last_log ->> 'message') else null end
  )
  on conflict (deployment_namespace, run_id) do update
  set completed_at = excluded.completed_at,
      logs = excluded.logs,
      summary = excluded.summary,
      updated_at = clock_timestamp();
  return true;
end
$$;

create or replace function classstatus_private.list_collector_logs(
  p_namespace text,
  p_limit integer,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 200), 200));
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  return coalesce((
    select jsonb_agg(page.log order by (page.log ->> 'timestamp')::timestamptz desc)
    from (
      select log.value as log
      from public.classstatus_collector_runs run
      cross join lateral jsonb_array_elements(run.logs) log(value)
      where run.deployment_namespace = p_namespace
      order by (log.value ->> 'timestamp')::timestamptz desc
      limit safe_limit
    ) page
  ), '[]'::jsonb);
end
$$;

revoke execute on all functions in schema classstatus_private from public, anon, authenticated;

create or replace function classstatus_private.list_public_suspensions(p_namespace text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      suspension.record
        - 'administrativeState'
        - 'revision'
        - 'removalRequestedAt'
        - 'undoDeadline'
        - 'removalFinalizedAt'
        - 'eventKey'
        - 'collectorProvenance'
        - 'parserOutcome'
        - 'fullAnnouncementText'
      order by suspension.published_at desc
    ),
    '[]'::jsonb
  )
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = p_namespace
    and suspension.administrative_state = 'active';
$$;

create or replace function classstatus_private.admin_snapshot(
  p_namespace text,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  result jsonb;
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);

  select jsonb_build_object(
    'records', coalesce((
      select jsonb_agg(suspension.record order by suspension.updated_at desc)
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = p_namespace
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', audit.audit_id,
        'timestamp', audit.occurred_at,
        'action', audit.action,
        'outcome', audit.outcome,
        'recordId', audit.record_id,
        'targetSummary', audit.target_summary,
        'correlationId', audit.correlation_id,
        'reasonCode', audit.reason_code,
        'effectiveAt', audit.effective_at
      ) order by audit.occurred_at desc)
      from (
        select *
        from public.classstatus_audit_entries source_audit
        where source_audit.deployment_namespace = p_namespace
        order by source_audit.occurred_at desc
        limit 1000
      ) audit
    ), '[]'::jsonb),
    'confirmations', '[]'::jsonb,
    'idempotency', '[]'::jsonb
  ) into result;
  return result;
end
$$;

create or replace function classstatus_private.create_confirmation(
  p_namespace text,
  p_receipt_id uuid,
  p_payload_hash text,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  expires_at timestamptz := clock_timestamp() + interval '10 minutes';
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'classstatus:confirmation-invalid';
  end if;
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);

  delete from public.classstatus_confirmation_receipts receipt
  where receipt.deployment_namespace = p_namespace
    and (receipt.expires_at <= clock_timestamp() or receipt.consumed_at is not null);

  insert into public.classstatus_confirmation_receipts (
    deployment_namespace, confirmation_id, admin_user_id, admin_session_id,
    payload_hash, expires_at
  )
  values (
    p_namespace, p_receipt_id, context.admin_user_id, context.admin_session_id,
    p_payload_hash, expires_at
  );

  return jsonb_build_object(
    'id', p_receipt_id,
    'sessionId', context.admin_session_id,
    'payloadHash', p_payload_hash,
    'expiresAt', expires_at
  );
end
$$;

create or replace function classstatus_private.publish_manual(
  p_namespace text,
  p_record jsonb,
  p_confirmation_id uuid,
  p_confirmation_payload_hash text,
  p_request_hash text,
  p_idempotency_key uuid,
  p_target_summary text,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  confirmation record;
  prior record;
  record_id text := p_record ->> 'id';
  event_key text := p_record ->> 'eventKey';
  now_at timestamptz := clock_timestamp();
begin
  if jsonb_typeof(p_record) <> 'object'
     or record_id is null
     or length(record_id) > 128
     or event_key !~ '^[0-9a-f]{64}$'
     or p_confirmation_payload_hash !~ '^[0-9a-f]{64}$'
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_record #>> '{publicationProvenance,type}' <> 'manual-admin'
     or coalesce((p_record ->> 'revision')::bigint, 0) <> 1
  then
    raise exception 'classstatus:confirmation-invalid';
  end if;

  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  perform pg_advisory_xact_lock(hashtextextended(
    p_namespace || ':' || p_idempotency_key::text || ':' || context.admin_session_id::text || ':publish',
    0
  ));

  select * into prior
  from public.classstatus_idempotency_receipts receipt
  where receipt.deployment_namespace = p_namespace
    and receipt.idempotency_key = p_idempotency_key
    and receipt.admin_session_id = context.admin_session_id
    and receipt.operation = 'publish';
  if prior is not null then
    if prior.request_hash <> p_request_hash then
      raise exception 'classstatus:idempotency-conflict';
    end if;
    return prior.response;
  end if;

  select * into confirmation
  from public.classstatus_confirmation_receipts receipt
  where receipt.deployment_namespace = p_namespace
    and receipt.confirmation_id = p_confirmation_id
    and receipt.admin_user_id = context.admin_user_id
    and receipt.admin_session_id = context.admin_session_id
    and receipt.payload_hash = p_confirmation_payload_hash
  for update;
  if confirmation is null
     or confirmation.consumed_at is not null
     or confirmation.expires_at <= now_at
  then
    raise exception 'classstatus:confirmation-invalid';
  end if;

  begin
    insert into public.classstatus_suspensions (
      deployment_namespace, record_id, record, event_key, conflict_key,
      provenance_type, administrative_state, revision, published_at
    )
    values (
      p_namespace,
      record_id,
      p_record,
      event_key,
      concat_ws('|',
        p_record ->> 'lguId',
        coalesce(p_record ->> 'schoolId', 'lgu'),
        p_record ->> 'effectiveDate',
        (select string_agg(value, ',' order by value) from jsonb_array_elements_text(p_record -> 'affectedLevels')),
        p_record ->> 'schoolSector',
        case when coalesce((p_record ->> 'isAllDay')::boolean, false)
          then 'all-day'
          else coalesce(p_record ->> 'startTime', '') || '-' || coalesce(p_record ->> 'endTime', '')
        end
      ),
      'manual-admin',
      'active',
      1,
      (p_record ->> 'publishedAt')::timestamptz
    );
  exception when unique_violation then
    raise exception 'classstatus:duplicate-publication';
  end;

  update public.classstatus_confirmation_receipts receipt
  set consumed_at = now_at
  where receipt.deployment_namespace = p_namespace
    and receipt.confirmation_id = p_confirmation_id;

  perform classstatus_private.insert_audit(
    p_namespace, context.admin_user_id, context.admin_session_id,
    'manual-publication', 'success', record_id, p_target_summary,
    p_idempotency_key::text
  );

  insert into public.classstatus_idempotency_receipts (
    deployment_namespace, idempotency_key, admin_user_id, admin_session_id,
    operation, request_hash, response
  )
  values (
    p_namespace, p_idempotency_key, context.admin_user_id, context.admin_session_id,
    'publish', p_request_hash, p_record
  );

  return p_record;
end
$$;

create or replace function classstatus_private.append_audit(
  p_namespace text,
  p_action text,
  p_outcome text,
  p_record_id text,
  p_target_summary text,
  p_correlation_id text,
  p_reason_code text,
  p_effective_at timestamptz,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
begin
  if p_outcome not in ('success', 'failure') or length(p_action) > 128 then
    raise exception 'classstatus:invalid-audit';
  end if;
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  return classstatus_private.insert_audit(
    p_namespace, context.admin_user_id, context.admin_session_id,
    p_action, p_outcome, p_record_id, p_target_summary, p_correlation_id,
    p_reason_code, p_effective_at
  );
end
$$;

create or replace function classstatus_private.list_audit(
  p_namespace text,
  p_limit integer,
  p_offset integer,
  p_supplied_user_id uuid default null,
  p_supplied_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  safe_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  return jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.audit_id,
        'timestamp', page.occurred_at,
        'action', page.action,
        'outcome', page.outcome,
        'recordId', page.record_id,
        'targetSummary', page.target_summary,
        'correlationId', page.correlation_id,
        'reasonCode', page.reason_code,
        'effectiveAt', page.effective_at
      ) order by page.occurred_at desc)
      from (
        select *
        from public.classstatus_audit_entries audit
        where audit.deployment_namespace = p_namespace
        order by audit.occurred_at desc
        limit safe_limit offset safe_offset
      ) page
    ), '[]'::jsonb),
    'total', (
      select count(*)
      from public.classstatus_audit_entries audit
      where audit.deployment_namespace = p_namespace
    )
  );
end
$$;

revoke execute on all functions in schema classstatus_private from public, anon, authenticated;

create or replace function classstatus_private.check_login_throttle(
  p_namespace text,
  p_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  retry_until timestamptz;
  global_fingerprint constant text := repeat('0', 64);
begin
  if p_namespace not in ('preview', 'production') or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'classstatus:invalid-throttle-request';
  end if;

  delete from public.classstatus_login_throttles throttle
  where throttle.deployment_namespace = p_namespace
    and throttle.window_started_at < now_at - interval '24 hours';

  select max(candidate.lock_until)
    into retry_until
  from public.classstatus_login_throttles candidate
  where candidate.deployment_namespace = p_namespace
    and candidate.fingerprint in (p_fingerprint, global_fingerprint)
    and candidate.lock_until > now_at;

  return jsonb_build_object(
    'allowed', retry_until is null,
    'retryAfterSeconds',
      case when retry_until is null then null
           else greatest(1, ceil(extract(epoch from retry_until - now_at))::integer)
      end
  );
end
$$;

create or replace function classstatus_private.record_login_failure(
  p_namespace text,
  p_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  current_fingerprint text;
  global_fingerprint constant text := repeat('0', 64);
  threshold integer;
  next_count integer;
  next_level integer;
  delay_seconds integer;
begin
  if p_namespace not in ('preview', 'production') or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'classstatus:invalid-throttle-request';
  end if;

  foreach current_fingerprint in array array[p_fingerprint, global_fingerprint]
  loop
    threshold := case when current_fingerprint = global_fingerprint then 30 else 5 end;
    insert into public.classstatus_login_throttles (
      deployment_namespace, fingerprint, failure_count, window_started_at,
      last_failure_at, lock_until, backoff_level
    )
    values (p_namespace, current_fingerprint, 0, now_at, now_at, null, 0)
    on conflict (deployment_namespace, fingerprint) do nothing;

    select
      case when throttle.window_started_at < now_at - interval '15 minutes'
           then 1 else throttle.failure_count + 1 end,
      case when throttle.window_started_at < now_at - interval '15 minutes'
           then 0 else throttle.backoff_level end
      into next_count, next_level
    from public.classstatus_login_throttles throttle
    where throttle.deployment_namespace = p_namespace
      and throttle.fingerprint = current_fingerprint
    for update;

    if next_count >= threshold then
      if current_fingerprint = global_fingerprint then
        delay_seconds := 900;
      else
        delay_seconds := (array[30, 60, 120, 300, 900])[least(next_level, 4) + 1];
      end if;
    else
      delay_seconds := 0;
    end if;

    update public.classstatus_login_throttles throttle
    set failure_count = next_count,
        window_started_at = case
          when throttle.window_started_at < now_at - interval '15 minutes' then now_at
          else throttle.window_started_at
        end,
        last_failure_at = now_at,
        lock_until = case when delay_seconds > 0 then now_at + make_interval(secs => delay_seconds) else throttle.lock_until end,
        backoff_level = case
          when delay_seconds > 0 and current_fingerprint <> global_fingerprint then least(next_level + 1, 4)
          else next_level
        end
    where throttle.deployment_namespace = p_namespace
      and throttle.fingerprint = current_fingerprint;
  end loop;

  return classstatus_private.check_login_throttle(p_namespace, p_fingerprint);
end
$$;

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
  now_at timestamptz := clock_timestamp();
  absolute_at timestamptz := now_at + interval '8 hours';
begin
  if p_csrf_digest !~ '^[0-9a-f]{64}$' or p_login_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'classstatus:session-invalid';
  end if;
  select * into context
  from classstatus_private.assert_authenticated_principal(p_namespace);

  insert into public.classstatus_admin_session_guards (
    deployment_namespace, admin_user_id, supabase_session_id, csrf_digest,
    created_at, last_seen_at, absolute_expires_at, revoked_at
  )
  values (
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

create or replace function classstatus_private.touch_admin_session(
  p_namespace text,
  p_touch boolean
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
  from classstatus_private.assert_authenticated_principal(p_namespace);

  update public.classstatus_admin_session_guards current_guard
  set last_seen_at = case
    when p_touch and current_guard.last_seen_at < now_at - interval '1 minute' then now_at
    else current_guard.last_seen_at
  end
  where current_guard.deployment_namespace = p_namespace
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

create or replace function classstatus_private.revoke_admin_session(p_namespace text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  context record;
begin
  select * into context
  from classstatus_private.assert_authenticated_principal(p_namespace);
  update public.classstatus_admin_session_guards guard
  set revoked_at = clock_timestamp()
  where guard.deployment_namespace = p_namespace
    and guard.admin_user_id = context.admin_user_id
    and guard.supabase_session_id = context.admin_session_id
    and guard.revoked_at is null;
  if not found then
    raise exception 'classstatus:session-invalid';
  end if;
  return true;
end
$$;

-- Preview and production wrappers hardcode their namespace. Namespace is never
-- accepted from an HTTP caller.
create or replace function public.classstatus_preview_check_login_throttle(p_fingerprint text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.check_login_throttle('preview', p_fingerprint); $$;
create or replace function public.classstatus_production_check_login_throttle(p_fingerprint text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.check_login_throttle('production', p_fingerprint); $$;
create or replace function public.classstatus_preview_record_login_failure(p_fingerprint text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.record_login_failure('preview', p_fingerprint); $$;
create or replace function public.classstatus_production_record_login_failure(p_fingerprint text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.record_login_failure('production', p_fingerprint); $$;

create or replace function public.classstatus_preview_start_admin_session(p_csrf_digest text, p_login_fingerprint text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.start_admin_session('preview', p_csrf_digest, p_login_fingerprint); $$;
create or replace function public.classstatus_production_start_admin_session(p_csrf_digest text, p_login_fingerprint text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.start_admin_session('production', p_csrf_digest, p_login_fingerprint); $$;
create or replace function public.classstatus_preview_touch_admin_session(p_touch boolean default true)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.touch_admin_session('preview', p_touch); $$;
create or replace function public.classstatus_production_touch_admin_session(p_touch boolean default true)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.touch_admin_session('production', p_touch); $$;
create or replace function public.classstatus_preview_revoke_admin_session()
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.revoke_admin_session('preview'); $$;
create or replace function public.classstatus_production_revoke_admin_session()
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.revoke_admin_session('production'); $$;

revoke execute on function public.classstatus_preview_check_login_throttle(text) from public;
revoke execute on function public.classstatus_production_check_login_throttle(text) from public;
revoke execute on function public.classstatus_preview_record_login_failure(text) from public;
revoke execute on function public.classstatus_production_record_login_failure(text) from public;
grant execute on function public.classstatus_preview_check_login_throttle(text) to anon, authenticated;
grant execute on function public.classstatus_production_check_login_throttle(text) to anon, authenticated;
grant execute on function public.classstatus_preview_record_login_failure(text) to anon, authenticated;
grant execute on function public.classstatus_production_record_login_failure(text) to anon, authenticated;

revoke execute on function public.classstatus_preview_start_admin_session(text, text) from public;
revoke execute on function public.classstatus_production_start_admin_session(text, text) from public;
revoke execute on function public.classstatus_preview_touch_admin_session(boolean) from public;
revoke execute on function public.classstatus_production_touch_admin_session(boolean) from public;
revoke execute on function public.classstatus_preview_revoke_admin_session() from public;
revoke execute on function public.classstatus_production_revoke_admin_session() from public;
grant execute on function public.classstatus_preview_start_admin_session(text, text) to authenticated;
grant execute on function public.classstatus_production_start_admin_session(text, text) to authenticated;
grant execute on function public.classstatus_preview_touch_admin_session(boolean) to authenticated;
grant execute on function public.classstatus_production_touch_admin_session(boolean) to authenticated;
grant execute on function public.classstatus_preview_revoke_admin_session() to authenticated;
grant execute on function public.classstatus_production_revoke_admin_session() to authenticated;

revoke execute on all functions in schema classstatus_private from public, anon, authenticated;

create or replace function public.classstatus_preview_list_public_suspensions()
returns jsonb language sql stable security definer set search_path = ''
as $$ select classstatus_private.list_public_suspensions('preview'); $$;
create or replace function public.classstatus_production_list_public_suspensions()
returns jsonb language sql stable security definer set search_path = ''
as $$ select classstatus_private.list_public_suspensions('production'); $$;

create or replace function public.classstatus_preview_admin_snapshot()
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.admin_snapshot('preview'); $$;
create or replace function public.classstatus_preview_create_confirmation(p_receipt_id uuid, p_payload_hash text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.create_confirmation('preview', p_receipt_id, p_payload_hash); $$;
create or replace function public.classstatus_preview_publish_manual(
  p_record jsonb, p_confirmation_id uuid, p_confirmation_payload_hash text,
  p_request_hash text, p_idempotency_key uuid, p_target_summary text
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.publish_manual(
  'preview', p_record, p_confirmation_id, p_confirmation_payload_hash,
  p_request_hash, p_idempotency_key, p_target_summary
); $$;
create or replace function public.classstatus_preview_mutate_lifecycle(
  p_operation text, p_record_id text, p_expected_revision bigint,
  p_idempotency_key uuid, p_request_hash text
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.mutate_lifecycle(
  'preview', p_operation, p_record_id, p_expected_revision,
  p_idempotency_key, p_request_hash
); $$;
create or replace function public.classstatus_preview_reconcile_removals()
returns integer language sql security definer set search_path = ''
as $$ select classstatus_private.reconcile_removals('preview'); $$;
create or replace function public.classstatus_preview_append_audit(
  p_action text, p_outcome text, p_record_id text default null,
  p_target_summary text default null, p_correlation_id text default null,
  p_reason_code text default null, p_effective_at timestamptz default null
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.append_audit(
  'preview', p_action, p_outcome, p_record_id, p_target_summary,
  p_correlation_id, p_reason_code, p_effective_at
); $$;
create or replace function public.classstatus_preview_list_audit(p_limit integer default 100, p_offset integer default 0)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.list_audit('preview', p_limit, p_offset); $$;
create or replace function public.classstatus_preview_upsert_collected(p_record jsonb, p_event_key text, p_conflict_key text)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.upsert_collected('preview', p_record, p_event_key, p_conflict_key); $$;
create or replace function public.classstatus_preview_append_collector_logs(p_logs jsonb)
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.append_collector_logs('preview', p_logs); $$;
create or replace function public.classstatus_preview_list_collector_logs(p_limit integer default 200)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.list_collector_logs('preview', p_limit); $$;

create or replace function public.classstatus_production_admin_snapshot(
  p_admin_user_id uuid, p_admin_session_id uuid
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.admin_snapshot(
  'production', p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_create_confirmation(
  p_receipt_id uuid, p_payload_hash text,
  p_admin_user_id uuid, p_admin_session_id uuid
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.create_confirmation(
  'production', p_receipt_id, p_payload_hash, p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_publish_manual(
  p_record jsonb, p_confirmation_id uuid, p_confirmation_payload_hash text,
  p_request_hash text, p_idempotency_key uuid, p_target_summary text,
  p_admin_user_id uuid, p_admin_session_id uuid
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.publish_manual(
  'production', p_record, p_confirmation_id, p_confirmation_payload_hash,
  p_request_hash, p_idempotency_key, p_target_summary,
  p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_mutate_lifecycle(
  p_operation text, p_record_id text, p_expected_revision bigint,
  p_idempotency_key uuid, p_request_hash text,
  p_admin_user_id uuid, p_admin_session_id uuid
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.mutate_lifecycle(
  'production', p_operation, p_record_id, p_expected_revision,
  p_idempotency_key, p_request_hash, p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_reconcile_removals(
  p_admin_user_id uuid, p_admin_session_id uuid
)
returns integer language sql security definer set search_path = ''
as $$ select classstatus_private.reconcile_removals(
  'production', p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_append_audit(
  p_action text, p_outcome text, p_record_id text default null,
  p_target_summary text default null, p_correlation_id text default null,
  p_reason_code text default null, p_effective_at timestamptz default null,
  p_admin_user_id uuid default null, p_admin_session_id uuid default null
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.append_audit(
  'production', p_action, p_outcome, p_record_id, p_target_summary,
  p_correlation_id, p_reason_code, p_effective_at,
  p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_list_audit(
  p_limit integer default 100, p_offset integer default 0,
  p_admin_user_id uuid default null, p_admin_session_id uuid default null
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.list_audit(
  'production', p_limit, p_offset, p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_upsert_collected(
  p_record jsonb, p_event_key text, p_conflict_key text,
  p_admin_user_id uuid, p_admin_session_id uuid
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.upsert_collected(
  'production', p_record, p_event_key, p_conflict_key,
  p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_append_collector_logs(
  p_logs jsonb, p_admin_user_id uuid, p_admin_session_id uuid
)
returns boolean language sql security definer set search_path = ''
as $$ select classstatus_private.append_collector_logs(
  'production', p_logs, p_admin_user_id, p_admin_session_id
); $$;
create or replace function public.classstatus_production_list_collector_logs(
  p_limit integer default 200,
  p_admin_user_id uuid default null, p_admin_session_id uuid default null
)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.list_collector_logs(
  'production', p_limit, p_admin_user_id, p_admin_session_id
); $$;

revoke execute on function public.classstatus_preview_list_public_suspensions() from public;
revoke execute on function public.classstatus_production_list_public_suspensions() from public;
grant execute on function public.classstatus_preview_list_public_suspensions() to anon, authenticated;
grant execute on function public.classstatus_production_list_public_suspensions() to anon, authenticated;

revoke execute on function public.classstatus_preview_admin_snapshot() from public;
revoke execute on function public.classstatus_preview_create_confirmation(uuid, text) from public;
revoke execute on function public.classstatus_preview_publish_manual(jsonb, uuid, text, text, uuid, text) from public;
revoke execute on function public.classstatus_preview_mutate_lifecycle(text, text, bigint, uuid, text) from public;
revoke execute on function public.classstatus_preview_reconcile_removals() from public;
revoke execute on function public.classstatus_preview_append_audit(text, text, text, text, text, text, timestamptz) from public;
revoke execute on function public.classstatus_preview_list_audit(integer, integer) from public;
revoke execute on function public.classstatus_preview_upsert_collected(jsonb, text, text) from public;
revoke execute on function public.classstatus_preview_append_collector_logs(jsonb) from public;
revoke execute on function public.classstatus_preview_list_collector_logs(integer) from public;
grant execute on function public.classstatus_preview_admin_snapshot() to authenticated;
grant execute on function public.classstatus_preview_create_confirmation(uuid, text) to authenticated;
grant execute on function public.classstatus_preview_publish_manual(jsonb, uuid, text, text, uuid, text) to authenticated;
grant execute on function public.classstatus_preview_mutate_lifecycle(text, text, bigint, uuid, text) to authenticated;
grant execute on function public.classstatus_preview_reconcile_removals() to authenticated;
grant execute on function public.classstatus_preview_append_audit(text, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.classstatus_preview_list_audit(integer, integer) to authenticated;
grant execute on function public.classstatus_preview_upsert_collected(jsonb, text, text) to authenticated;
grant execute on function public.classstatus_preview_append_collector_logs(jsonb) to authenticated;
grant execute on function public.classstatus_preview_list_collector_logs(integer) to authenticated;

revoke execute on function public.classstatus_production_admin_snapshot(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_create_confirmation(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_publish_manual(jsonb, uuid, text, text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_mutate_lifecycle(text, text, bigint, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_reconcile_removals(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_append_audit(text, text, text, text, text, text, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_list_audit(integer, integer, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_upsert_collected(jsonb, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_append_collector_logs(jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.classstatus_production_list_collector_logs(integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.classstatus_production_admin_snapshot(uuid, uuid) to service_role;
grant execute on function public.classstatus_production_create_confirmation(uuid, text, uuid, uuid) to service_role;
grant execute on function public.classstatus_production_publish_manual(jsonb, uuid, text, text, uuid, text, uuid, uuid) to service_role;
grant execute on function public.classstatus_production_mutate_lifecycle(text, text, bigint, uuid, text, uuid, uuid) to service_role;
grant execute on function public.classstatus_production_reconcile_removals(uuid, uuid) to service_role;
grant execute on function public.classstatus_production_append_audit(text, text, text, text, text, text, timestamptz, uuid, uuid) to service_role;
grant execute on function public.classstatus_production_list_audit(integer, integer, uuid, uuid) to service_role;
grant execute on function public.classstatus_production_upsert_collected(jsonb, text, text, uuid, uuid) to service_role;
grant execute on function public.classstatus_production_append_collector_logs(jsonb, uuid, uuid) to service_role;
grant execute on function public.classstatus_production_list_collector_logs(integer, uuid, uuid) to service_role;

revoke execute on all functions in schema classstatus_private from public, anon, authenticated, service_role;

create or replace function classstatus_private.import_suspensions(
  p_namespace text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  source_record jsonb;
  imported_count integer := 0;
  skipped_count integer := 0;
  provenance text;
  admin_state text;
begin
  if (select auth.jwt() ->> 'role') <> 'service_role'
     or p_namespace not in ('preview', 'production')
     or jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_records) > 5000
  then
    raise exception 'classstatus:forbidden';
  end if;

  for item in select value from jsonb_array_elements(p_records)
  loop
    source_record := item -> 'record';
    provenance := source_record #>> '{publicationProvenance,type}';
    admin_state := coalesce(source_record ->> 'administrativeState', 'active');
    if jsonb_typeof(source_record) <> 'object'
       or item ->> 'eventKey' !~ '^[0-9a-f]{64}$'
       or provenance not in ('manual-admin', 'automatic-collector')
       or admin_state not in ('active', 'pending_removal', 'removed')
       or (provenance = 'automatic-collector' and (
         source_record #>> '{collectorProvenance,pipeline}' <> 'tier3-media'
         or source_record #>> '{source,id}' not in ('rappler-walang-pasok', 'gma-news-walang-pasok')
       ))
    then
      raise exception 'classstatus:import-record-invalid';
    end if;

    begin
      insert into public.classstatus_suspensions (
        deployment_namespace, record_id, record, event_key, conflict_key,
        provenance_type, administrative_state, revision, undo_deadline,
        removal_finalized_at, published_at
      )
      values (
        p_namespace,
        source_record ->> 'id',
        source_record || jsonb_build_object(
          'eventKey', item ->> 'eventKey',
          'administrativeState', admin_state,
          'revision', greatest(1, coalesce((source_record ->> 'revision')::bigint, 1))
        ),
        item ->> 'eventKey',
        item ->> 'conflictKey',
        provenance,
        admin_state,
        greatest(1, coalesce((source_record ->> 'revision')::bigint, 1)),
        nullif(source_record ->> 'undoDeadline', '')::timestamptz,
        nullif(source_record ->> 'removalFinalizedAt', '')::timestamptz,
        (source_record ->> 'publishedAt')::timestamptz
      )
      on conflict (deployment_namespace, record_id) do nothing;
      if found then imported_count := imported_count + 1;
      else skipped_count := skipped_count + 1;
      end if;
    exception when unique_violation then
      raise exception 'classstatus:import-conflict';
    end;
  end loop;

  perform classstatus_private.insert_audit(
    p_namespace, null, null, 'migration-import', 'success', null,
    imported_count::text || ' suspension record(s)', null,
    'records-only-no-security-state'
  );
  return jsonb_build_object('imported', imported_count, 'skipped', skipped_count);
end
$$;

create or replace function public.classstatus_preview_import_suspensions(p_records jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.import_suspensions('preview', p_records); $$;
create or replace function public.classstatus_production_import_suspensions(p_records jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select classstatus_private.import_suspensions('production', p_records); $$;
revoke execute on function public.classstatus_preview_import_suspensions(jsonb) from public, anon, authenticated;
revoke execute on function public.classstatus_production_import_suspensions(jsonb) from public, anon, authenticated;
grant execute on function public.classstatus_preview_import_suspensions(jsonb) to service_role;
grant execute on function public.classstatus_production_import_suspensions(jsonb) to service_role;
revoke execute on all functions in schema classstatus_private from public, anon, authenticated, service_role;
