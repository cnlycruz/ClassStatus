-- The original function used a PL/pgSQL variable named run_id. With
-- plpgsql.variable_conflict = error, that name is ambiguous in the collector
-- run upsert because the target table also has a run_id column.
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
  if jsonb_typeof(p_logs) <> 'array' or jsonb_array_length(p_logs) = 0 or jsonb_array_length(p_logs) > 500 then
    raise exception 'classstatus:collector-log-invalid';
  end if;
  first_log := p_logs -> 0;
  last_log := p_logs -> (jsonb_array_length(p_logs) - 1);
  resolved_run_id := first_log ->> 'runId';
  if resolved_run_id is null or length(resolved_run_id) > 128 or exists (
    select 1 from jsonb_array_elements(p_logs) item
    where item ->> 'runId' <> resolved_run_id
  ) then
    raise exception 'classstatus:collector-log-invalid';
  end if;

  insert into public.classstatus_collector_runs (
    deployment_namespace, run_id, started_at, completed_at, logs, summary
  )
  values (
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
  set completed_at = excluded.completed_at,
      logs = excluded.logs,
      summary = excluded.summary,
      updated_at = clock_timestamp();
  return true;
end
$$;

-- The private implementation must remain callable only through the hardened
-- Preview and Production wrappers.
revoke execute on function classstatus_private.append_collector_logs(text, jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
