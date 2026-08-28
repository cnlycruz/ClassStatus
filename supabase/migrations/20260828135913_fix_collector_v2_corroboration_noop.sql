-- Correct collector-policy-v2 transition behavior without changing the signed
-- worker RPC shape or any public wrapper. This migration replaces only the
-- shared private upsert implementation used by both deployment namespaces.

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
  duplicate_manual public.classstatus_suspensions%rowtype;
  existing public.classstatus_suspensions%rowtype;
  plausible_count integer;
  expected_event_key text;
  expected_family_key text;
  existing_sources jsonb;
  same_org_source jsonb;
  candidate_org text;
  candidate_is_primary boolean;
  same_evidence boolean;
  same_semantic boolean;
  relation text;
  stored_policy_version integer;
  incoming_is_newer boolean;
  use_candidate_state boolean := false;
  preferred jsonb;
  source_pool jsonb;
  verified_sources jsonb;
  merged jsonb;
  confidence text;
  action_name text;
begin
  expected_event_key := classstatus_private.notice_event_key(p_namespace, p_record);
  expected_family_key := classstatus_private.notice_family_key(p_namespace, p_record);
  if pg_catalog.jsonb_typeof(p_record) <> 'object'
     or p_record ->> 'parserOutcome' <> 'accepted:tier3-lgu-suspension:v2'
     or p_event_key !~ '^v2e:[0-9a-f]{64}$'
     or p_conflict_key !~ '^v2f:[0-9a-f]{64}$'
     or p_event_key <> expected_event_key
     or p_record ->> 'eventKey' <> expected_event_key
     or p_conflict_key <> expected_family_key
     or p_record #>> '{publicationProvenance,type}' <> 'automatic-collector'
     or p_record #>> '{collectorProvenance,pipeline}' <> 'tier3-media'
     or p_record #>> '{source,id}' not in ('rappler-walang-pasok', 'gma-news-walang-pasok')
     or p_record #>> '{source,type}' <> 'news-reputable'
     or coalesce((p_record #>> '{source,reliabilityTier}')::integer, 0) <> 3
     or coalesce((p_record ->> 'isDemo')::boolean, false)
  then
    raise exception 'classstatus:collector-policy-key-rejected';
  end if;

  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(expected_family_key, 0));

  select suspension.* into duplicate_manual
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = p_namespace
    and suspension.provenance_type = 'manual-admin'
    and suspension.administrative_state in ('active', 'pending_removal')
    and classstatus_private.notice_family_key(p_namespace, suspension.record) = expected_family_key
    and classstatus_private.notice_windows_overlap(suspension.record, p_record)
  order by suspension.created_at, suspension.record_id
  limit 1;
  if duplicate_manual.record_id is not null then
    return pg_catalog.jsonb_build_object(
      'action', 'held', 'record', p_record,
      'reason', 'duplicates-manual:' || duplicate_manual.record_id
    );
  end if;

  select pg_catalog.count(distinct suspension.record_id)
  into plausible_count
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = p_namespace
    and suspension.provenance_type = 'automatic-collector'
    and suspension.administrative_state in ('active', 'pending_removal')
    and classstatus_private.notice_family_key(p_namespace, suspension.record) = expected_family_key
    and (
      classstatus_private.notice_event_key(p_namespace, suspension.record) = expected_event_key
      or classstatus_private.notice_windows_overlap(suspension.record, p_record)
    );

  if plausible_count > 1 then
    return pg_catalog.jsonb_build_object(
      'action', 'held', 'record', p_record,
      'reason', 'legacy-duplicates-require-cleanup'
    );
  end if;

  if plausible_count = 1 then
    select suspension.* into existing
    from public.classstatus_suspensions suspension
    where suspension.deployment_namespace = p_namespace
      and suspension.provenance_type = 'automatic-collector'
      and suspension.administrative_state in ('active', 'pending_removal')
      and classstatus_private.notice_family_key(p_namespace, suspension.record) = expected_family_key
      and (
        classstatus_private.notice_event_key(p_namespace, suspension.record) = expected_event_key
        or classstatus_private.notice_windows_overlap(suspension.record, p_record)
      )
    order by suspension.created_at, suspension.record_id
    limit 1 for update;
  end if;

  if existing.record_id is null then
    p_record := p_record || pg_catalog.jsonb_build_object(
      'source', (p_record -> 'source') || pg_catalog.jsonb_build_object('verified', false),
      'additionalSources', '[]'::jsonb,
      'confidence', 'medium',
      'revision', coalesce((p_record ->> 'revision')::bigint, 1)
    );
    insert into public.classstatus_suspensions (
      deployment_namespace, record_id, record, event_key, conflict_key,
      provenance_type, administrative_state, revision, published_at
    ) values (
      p_namespace, p_record ->> 'id', p_record, expected_event_key, expected_family_key,
      'automatic-collector', 'active', coalesce((p_record ->> 'revision')::bigint, 1),
      (p_record ->> 'publishedAt')::timestamptz
    );
    return pg_catalog.jsonb_build_object('action', 'created', 'record', p_record);
  end if;

  if existing.administrative_state <> 'active' then
    return pg_catalog.jsonb_build_object(
      'action', 'held', 'record', p_record,
      'reason', 'administratively-removed:' || existing.record_id
    );
  end if;

  existing_sources := pg_catalog.jsonb_build_array(existing.record -> 'source')
    || coalesce(existing.record -> 'additionalSources', '[]'::jsonb);
  candidate_org := pg_catalog.lower(pg_catalog.btrim(p_record #>> '{source,organization}'));
  candidate_is_primary := coalesce(
    pg_catalog.lower(pg_catalog.btrim(existing.record #>> '{source,organization}')),
    ''
  ) = candidate_org;
  select source.value into same_org_source
  from pg_catalog.jsonb_array_elements(existing_sources) source(value)
  where pg_catalog.lower(pg_catalog.btrim(source.value ->> 'organization')) = candidate_org
  limit 1;
  same_evidence := same_org_source is not null
    and classstatus_private.source_evidence_fingerprint(same_org_source)
      = classstatus_private.source_evidence_fingerprint(p_record -> 'source');
  same_semantic := classstatus_private.notice_semantic_fingerprint(existing.record)
    = classstatus_private.notice_semantic_fingerprint(p_record);
  if same_evidence and same_semantic then
    return pg_catalog.jsonb_build_object('action', 'unchanged', 'record', existing.record);
  end if;

  relation := classstatus_private.notice_scope_relation(existing.record, p_record);
  stored_policy_version := case
    when existing.record ->> 'parserOutcome' = 'accepted:tier3-lgu-suspension:v2' then 2
    else 1
  end;

  if same_org_source is not null then
    action_name := 'updated';
    if same_evidence
       and not candidate_is_primary
       and relation = 'equal'
       and existing.record ->> 'status' = p_record ->> 'status'
    then
      return pg_catalog.jsonb_build_object('action', 'unchanged', 'record', existing.record);
    end if;
    incoming_is_newer := coalesce(p_record #>> '{source,updatedAt}', p_record #>> '{source,publishedAt}', '')
      > coalesce(same_org_source ->> 'updatedAt', same_org_source ->> 'publishedAt', '');
    if same_evidence and stored_policy_version >= 2 then
      return pg_catalog.jsonb_build_object(
        'action', 'held', 'record', p_record, 'reason', 'collector-policy-version-conflict'
      );
    end if;
    if not same_evidence and not incoming_is_newer and relation <> 'expands' then
      return pg_catalog.jsonb_build_object('action', 'unchanged', 'record', existing.record);
    end if;
    use_candidate_state := not same_semantic;
    source_pool := pg_catalog.jsonb_build_array(p_record -> 'source') || coalesce((
      select pg_catalog.jsonb_agg(source.value order by source.ordinality)
      from pg_catalog.jsonb_array_elements(existing_sources) with ordinality source(value, ordinality)
      where pg_catalog.lower(pg_catalog.btrim(source.value ->> 'organization')) <> candidate_org
    ), '[]'::jsonb);
  else
    action_name := 'merged';
    if not same_semantic and relation not in ('equal', 'expands') then
      return pg_catalog.jsonb_build_object(
        'action', 'held', 'record', p_record, 'reason', 'cross-source-scope-conflict'
      );
    end if;
    if existing.record ->> 'status' <> p_record ->> 'status' then
      if stored_policy_version < 2 and relation in ('equal', 'expands') then
        use_candidate_state := true;
      else
        return pg_catalog.jsonb_build_object(
          'action', 'held', 'record', p_record, 'reason', 'cross-source-status-conflict'
        );
      end if;
    else
      use_candidate_state := relation = 'expands';
    end if;
    source_pool := case when use_candidate_state
      then pg_catalog.jsonb_build_array(p_record -> 'source') || existing_sources
      else existing_sources || pg_catalog.jsonb_build_array(p_record -> 'source')
    end;
  end if;

  with source_rows as (
    select source.value, source.ordinality,
      pg_catalog.lower(pg_catalog.btrim(source.value ->> 'organization')) as organization
    from pg_catalog.jsonb_array_elements(source_pool) with ordinality source(value, ordinality)
  ), current_per_organization as (
    select distinct on (organization) value, ordinality
    from source_rows
    where organization <> ''
    order by organization, ordinality
  ), bounded as (
    select value, ordinality
    from current_per_organization
    order by ordinality
    limit 4
  )
  select
    case when pg_catalog.count(*) >= 2 then 'high' else 'medium' end,
    pg_catalog.jsonb_agg(
      value || pg_catalog.jsonb_build_object(
        'verified', (select pg_catalog.count(*) from bounded) >= 2
      )
      order by ordinality
    )
  into confidence, verified_sources
  from bounded;

  preferred := case when use_candidate_state then p_record else existing.record end;
  merged := preferred || pg_catalog.jsonb_build_object(
    'id', existing.record_id,
    'eventKey', classstatus_private.notice_event_key(p_namespace, preferred),
    'source', verified_sources -> 0,
    'additionalSources', coalesce(verified_sources - 0, '[]'::jsonb),
    'confidence', confidence,
    'publicationProvenance', pg_catalog.jsonb_build_object(
      'type', 'automatic-collector',
      'publicLabel', 'Published from approved Tier 3 media evidence'
    ),
    'administrativeState', 'active',
    'parserOutcome', 'accepted:tier3-lgu-suspension:v2',
    'revision', existing.revision + 1
  );

  update public.classstatus_suspensions suspension
  set record = merged,
      event_key = classstatus_private.notice_event_key(p_namespace, preferred),
      conflict_key = expected_family_key,
      revision = existing.revision + 1,
      published_at = (merged ->> 'publishedAt')::timestamptz,
      updated_at = pg_catalog.clock_timestamp()
  where suspension.deployment_namespace = p_namespace
    and suspension.record_id = existing.record_id
    and suspension.revision = existing.revision;
  if not found then raise exception 'classstatus:stale-revision'; end if;
  return pg_catalog.jsonb_build_object('action', action_name, 'record', merged);
exception when invalid_text_representation then
  raise exception 'classstatus:collector-policy-key-rejected';
end
$$;

revoke execute on function classstatus_private.upsert_collected(
  text, jsonb, text, text, uuid, uuid
) from public, anon, authenticated, service_role;
