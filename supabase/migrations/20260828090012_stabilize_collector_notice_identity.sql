-- Collector policy v2. This migration is intentionally shared by Preview and
-- Production namespaces because both use the same private function bodies.

alter table public.classstatus_suspensions
  drop constraint classstatus_suspensions_event_key_check;
alter table public.classstatus_suspensions
  add constraint classstatus_suspensions_event_key_check
  check (event_key ~ '^(?:[0-9a-f]{64}|v2e:[0-9a-f]{64})$');

-- The one-off service-role importer is no longer a supported workflow. Retire
-- its public wrappers and private implementation so automatic publications can
-- enter storage only through the signed collector-policy-v2 boundary.
drop function if exists public.classstatus_preview_import_suspensions(jsonb);
drop function if exists public.classstatus_production_import_suspensions(jsonb);
drop function if exists classstatus_private.import_suspensions(text, jsonb);

create or replace function classstatus_private.notice_family_key(
  p_namespace text,
  p_record jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  target_key text;
  material text;
begin
  if p_namespace not in ('preview', 'production')
     or pg_catalog.jsonb_typeof(p_record) <> 'object'
     or coalesce(p_record ->> 'lguId', '') = ''
     or coalesce(p_record ->> 'effectiveDate', '') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  then
    raise exception 'classstatus:collector-policy-key-rejected';
  end if;
  target_key := case
    when nullif(p_record ->> 'schoolId', '') is not null
      then 'school:' || (p_record ->> 'schoolId')
    else 'lgu:' || (p_record ->> 'lguId')
  end;
  material := 'classstatus-notice-family-v2' || pg_catalog.chr(10)
    || p_namespace || pg_catalog.chr(10)
    || target_key || pg_catalog.chr(10)
    || (p_record ->> 'effectiveDate');
  return 'v2f:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(material, 'UTF8'), 'sha256'),
    'hex'
  );
end
$$;

create or replace function classstatus_private.notice_window_key(p_record jsonb)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  end_date text := coalesce(p_record ->> 'endDate', p_record ->> 'effectiveDate');
begin
  if coalesce((p_record ->> 'untilFurtherNotice')::boolean, false) then
    return 'until-further-notice';
  end if;
  if coalesce((p_record ->> 'isAllDay')::boolean, false) then
    return 'all-day:' || end_date;
  end if;
  return 'time:' || coalesce(p_record ->> 'startTime', '') || '-'
    || coalesce(p_record ->> 'endTime', '') || ':' || end_date;
exception when invalid_text_representation then
  raise exception 'classstatus:collector-policy-key-rejected';
end
$$;

create or replace function classstatus_private.notice_event_key(
  p_namespace text,
  p_record jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  family_key text := classstatus_private.notice_family_key(p_namespace, p_record);
  material text;
begin
  material := 'classstatus-notice-event-v2' || pg_catalog.chr(10)
    || family_key || pg_catalog.chr(10)
    || classstatus_private.notice_window_key(p_record);
  return 'v2e:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(material, 'UTF8'), 'sha256'),
    'hex'
  );
end
$$;

create or replace function classstatus_private.notice_windows_overlap(
  p_left jsonb,
  p_right jsonb
)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  left_start integer;
  left_end integer;
  right_start integer;
  right_end integer;
begin
  if coalesce((p_left ->> 'isAllDay')::boolean, false)
     or coalesce((p_left ->> 'untilFurtherNotice')::boolean, false)
     or coalesce((p_right ->> 'isAllDay')::boolean, false)
     or coalesce((p_right ->> 'untilFurtherNotice')::boolean, false)
  then
    return true;
  end if;
  left_start := coalesce(nullif(pg_catalog.replace(p_left ->> 'startTime', ':', ''), '')::integer, 0);
  left_end := coalesce(nullif(pg_catalog.replace(p_left ->> 'endTime', ':', ''), '')::integer, 2400);
  right_start := coalesce(nullif(pg_catalog.replace(p_right ->> 'startTime', ':', ''), '')::integer, 0);
  right_end := coalesce(nullif(pg_catalog.replace(p_right ->> 'endTime', ':', ''), '')::integer, 2400);
  return left_start < right_end and right_start < left_end;
exception when invalid_text_representation then
  return false;
end
$$;

create or replace function classstatus_private.notice_semantic_fingerprint(p_record jsonb)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'status', p_record -> 'status',
          'affectedLevels', p_record -> 'affectedLevels',
          'schoolSector', p_record -> 'schoolSector',
          'effectiveDate', p_record -> 'effectiveDate',
          'endDate', coalesce(p_record -> 'endDate', 'null'::jsonb),
          'isAllDay', p_record -> 'isAllDay',
          'untilFurtherNotice', coalesce(p_record -> 'untilFurtherNotice', 'false'::jsonb),
          'startTime', coalesce(p_record -> 'startTime', 'null'::jsonb),
          'endTime', coalesce(p_record -> 'endTime', 'null'::jsonb),
          'reason', p_record -> 'reason',
          'announcementSummary', p_record -> 'announcementSummary'
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function classstatus_private.source_evidence_fingerprint(p_source jsonb)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(p_source ->> 'evidenceFingerprint', ''),
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'organization', pg_catalog.lower(pg_catalog.btrim(p_source ->> 'organization')),
            'url', p_source -> 'url',
            'publishedAt', p_source -> 'publishedAt',
            'updatedAt', coalesce(p_source -> 'updatedAt', 'null'::jsonb),
            'evidenceExcerpt', coalesce(p_source -> 'evidenceExcerpt', 'null'::jsonb)
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  );
$$;

create or replace function classstatus_private.notice_scope_relation(
  p_existing jsonb,
  p_candidate jsonb
)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  candidate_levels_cover boolean;
  existing_levels_cover boolean;
  candidate_sector_cover boolean;
  existing_sector_cover boolean;
  candidate_window_cover boolean;
  existing_window_cover boolean;
  candidate_covers boolean;
  existing_covers boolean;
begin
  if not classstatus_private.notice_windows_overlap(p_existing, p_candidate) then
    return 'incompatible';
  end if;

  candidate_levels_cover := (p_candidate -> 'affectedLevels') ? 'all-levels'
    or not exists (
      select 1 from pg_catalog.jsonb_array_elements_text(p_existing -> 'affectedLevels') level(value)
      where level.value <> 'all-levels' and not ((p_candidate -> 'affectedLevels') ? level.value)
    );
  existing_levels_cover := (p_existing -> 'affectedLevels') ? 'all-levels'
    or not exists (
      select 1 from pg_catalog.jsonb_array_elements_text(p_candidate -> 'affectedLevels') level(value)
      where level.value <> 'all-levels' and not ((p_existing -> 'affectedLevels') ? level.value)
    );
  candidate_sector_cover := p_candidate ->> 'schoolSector' = 'all'
    or p_candidate ->> 'schoolSector' = p_existing ->> 'schoolSector';
  existing_sector_cover := p_existing ->> 'schoolSector' = 'all'
    or p_existing ->> 'schoolSector' = p_candidate ->> 'schoolSector';
  candidate_window_cover := coalesce((p_candidate ->> 'untilFurtherNotice')::boolean, false)
    or coalesce((p_candidate ->> 'isAllDay')::boolean, false)
    or (
      not coalesce((p_existing ->> 'isAllDay')::boolean, false)
      and coalesce(p_candidate ->> 'startTime', '00:00') <= coalesce(p_existing ->> 'startTime', '00:00')
      and coalesce(p_candidate ->> 'endTime', '23:59') >= coalesce(p_existing ->> 'endTime', '23:59')
    );
  existing_window_cover := coalesce((p_existing ->> 'untilFurtherNotice')::boolean, false)
    or coalesce((p_existing ->> 'isAllDay')::boolean, false)
    or (
      not coalesce((p_candidate ->> 'isAllDay')::boolean, false)
      and coalesce(p_existing ->> 'startTime', '00:00') <= coalesce(p_candidate ->> 'startTime', '00:00')
      and coalesce(p_existing ->> 'endTime', '23:59') >= coalesce(p_candidate ->> 'endTime', '23:59')
    );
  candidate_covers := candidate_levels_cover and candidate_sector_cover and candidate_window_cover;
  existing_covers := existing_levels_cover and existing_sector_cover and existing_window_cover;
  if candidate_covers and existing_covers then return 'equal'; end if;
  if candidate_covers then return 'expands'; end if;
  if existing_covers then return 'narrows'; end if;
  return 'incompatible';
exception when invalid_text_representation then
  return 'incompatible';
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
  duplicate_manual public.classstatus_suspensions%rowtype;
  existing public.classstatus_suspensions%rowtype;
  plausible_count integer;
  expected_event_key text;
  expected_family_key text;
  existing_sources jsonb;
  same_org_source jsonb;
  candidate_org text;
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
  duplicate_record record;
  record_id text := p_record ->> 'id';
  event_key text := p_record ->> 'eventKey';
  family_key text;
  expected_event_key text;
  now_at timestamptz := pg_catalog.clock_timestamp();
begin
  family_key := classstatus_private.notice_family_key(p_namespace, p_record);
  expected_event_key := classstatus_private.notice_event_key(p_namespace, p_record);
  if pg_catalog.jsonb_typeof(p_record) <> 'object'
     or record_id is null
     or pg_catalog.length(record_id) > 128
     or event_key !~ '^(?:[0-9a-f]{64}|v2e:[0-9a-f]{64})$'
     or (event_key like 'v2e:%' and event_key <> expected_event_key)
     or p_confirmation_payload_hash !~ '^[0-9a-f]{64}$'
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_record #>> '{publicationProvenance,type}' <> 'manual-admin'
     or coalesce((p_record ->> 'revision')::bigint, 0) <> 1
  then
    raise exception 'classstatus:confirmation-invalid';
  end if;

  select * into context
  from classstatus_private.resolve_admin_actor(p_namespace, p_supplied_user_id, p_supplied_session_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_namespace || ':' || p_idempotency_key::text || ':' || context.admin_session_id::text || ':publish', 0
  ));

  select * into prior
  from public.classstatus_idempotency_receipts receipt
  where receipt.deployment_namespace = p_namespace
    and receipt.idempotency_key = p_idempotency_key
    and receipt.admin_session_id = context.admin_session_id
    and receipt.operation = 'publish';
  if prior is not null then
    if prior.request_hash <> p_request_hash then raise exception 'classstatus:idempotency-conflict'; end if;
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
  if confirmation is null or confirmation.consumed_at is not null or confirmation.expires_at <= now_at then
    raise exception 'classstatus:confirmation-invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(family_key, 0));
  select suspension.record_id into duplicate_record
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = p_namespace
    and suspension.administrative_state in ('active', 'pending_removal')
    and classstatus_private.notice_event_key(p_namespace, suspension.record) = expected_event_key
  order by suspension.created_at, suspension.record_id
  limit 1;
  if duplicate_record.record_id is not null then raise exception 'classstatus:duplicate-publication'; end if;

  begin
    insert into public.classstatus_suspensions (
      deployment_namespace, record_id, record, event_key, conflict_key,
      provenance_type, administrative_state, revision, published_at
    ) values (
      p_namespace, record_id, p_record, event_key, family_key,
      'manual-admin', 'active', 1, (p_record ->> 'publishedAt')::timestamptz
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
    'manual-publication', 'success', record_id, p_target_summary, p_idempotency_key::text
  );
  insert into public.classstatus_idempotency_receipts (
    deployment_namespace, idempotency_key, admin_user_id, admin_session_id,
    operation, request_hash, response
  ) values (
    p_namespace, p_idempotency_key, context.admin_user_id, context.admin_session_id,
    'publish', p_request_hash, p_record
  );
  return p_record;
exception when invalid_text_representation then
  raise exception 'classstatus:confirmation-invalid';
end
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
  select pg_catalog.jsonb_build_object(
    'records', coalesce((
      select pg_catalog.jsonb_agg(suspension.record order by
        suspension.record ->> 'effectiveDate',
        case suspension.record ->> 'lguId'
          when 'caloocan' then 1 when 'las-pinas' then 2 when 'makati' then 3
          when 'malabon' then 4 when 'mandaluyong' then 5 when 'manila' then 6
          when 'marikina' then 7 when 'muntinlupa' then 8 when 'navotas' then 9
          when 'paranaque' then 10 when 'pasay' then 11 when 'pasig' then 12
          when 'pateros' then 13 when 'quezon-city' then 14 when 'san-juan' then 15
          when 'taguig' then 16 when 'valenzuela' then 17 else 99 end,
        case when suspension.record ? 'schoolId' then 1 else 0 end,
        coalesce(suspension.record ->> 'schoolId', ''),
        suspension.created_at,
        suspension.record_id
      )
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = p_namespace
    ), '[]'::jsonb),
    'audit', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', audit.audit_id, 'timestamp', audit.occurred_at,
        'action', audit.action, 'outcome', audit.outcome,
        'recordId', audit.record_id, 'targetSummary', audit.target_summary,
        'correlationId', audit.correlation_id, 'reasonCode', audit.reason_code,
        'effectiveAt', audit.effective_at
      ) order by audit.occurred_at desc)
      from (
        select * from public.classstatus_audit_entries source_audit
        where source_audit.deployment_namespace = p_namespace
        order by source_audit.occurred_at desc limit 1000
      ) audit
    ), '[]'::jsonb),
    'confirmations', '[]'::jsonb,
    'idempotency', '[]'::jsonb
  ) into result;
  return result;
end
$$;

revoke execute on all functions in schema classstatus_private
  from public, anon, authenticated, service_role;

-- Public wrappers and signed worker wrappers keep their existing signatures,
-- SECURITY DEFINER configuration, empty search_path, and grants. No scheduler
-- or Production row is changed by this migration file until it is applied.
