-- Reviewed one-time reconciliation for the two legacy Valenzuela automatic
-- collector rows effective 2026-08-29. This migration is deliberately coupled
-- to the approved Production snapshot and aborts atomically on any drift.

begin;

do $cleanup$
declare
  cleanup_timestamp timestamptz := pg_catalog.clock_timestamp();
  migration_id constant text := '20260828194729_cleanup_20260829_valenzuela_legacy_duplicate';
  survivor_id constant text := 'tier3-0b1f828ae71173486914';
  retired_id constant text := 'tier3-f9ba019468aaa43100b0';
  survivor_legacy_event constant text := '16768343438a0f84861abe2dde7b8fff44f20ae232e614969cec2b53531386c8';
  retired_legacy_event constant text := 'c3df8df42f435317a420bfe8db534654cbb721fe0a0a5e81f4335f9718cc7e81';
  legacy_conflict constant text := 'valenzuela|lgu|2026-08-29|all-levels|all|all-day';
  canonical_family constant text := 'v2f:d2d74b32965ba79ac9b0e1a0d4af185de979cbbe25e3a065544900745050e9d2';
  canonical_event constant text := 'v2e:8b96a6c76dcb9f456b0093ddd8fd75c31516c1525071f99b248a9e26acaadf58';
  source_url constant text := 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-29-2026/';
  survivor_fingerprint constant text := 'b7fa71de7a1f21c39c9d4e1893b06989ff4b1161496dd9144af26c5c44850712';
  retired_fingerprint constant text := '8796c33d1bc6a28003c5e20082b30b6faa2c9a12d220cf4849da97323cc47636';
  survivor_excerpt constant text := 'MANILA, Philippines – Some areas suspended classes for Saturday, August 29, due to the effects of the enhanced southwest monsoon or habagat.'
    || pg_catalog.chr(10) || 'Metro Manila'
    || pg_catalog.chr(10) || 'Valenzuela City – face-to-face classes in all levels (public and private)';
  retired_excerpt constant text := 'MANILA, Philippines – Some areas suspended classes for Saturday, August 29, due to the effects of the enhanced southwest monsoon or habagat.'
    || pg_catalog.chr(10) || 'Metro Manila'
    || pg_catalog.chr(10) || 'Valenzuela City – all levels (public and private)';
  cron_count integer;
  inactive_cron_count integer;
  target_count integer;
  changed_count integer;
  audit_count integer;
  survivor public.classstatus_suspensions%rowtype;
  retired public.classstatus_suspensions%rowtype;
  new_record jsonb;
  retired_source jsonb;
  untouched_fingerprint_before text;
  untouched_fingerprint_after text;
begin
  -- Hold the reviewed lease-table lock until COMMIT. Collector acquisition,
  -- refresh, and release all write this table and therefore cannot race this
  -- cleanup after the no-active-lease check.
  lock table public.classstatus_collector_leases in share mode;

  if exists (
    select 1
    from public.classstatus_collector_leases lease
    where lease.deployment_namespace = 'production'
      and lease.lease_expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception 'classstatus:valenzuela-cleanup-production-collector-lease-active';
  end if;

  select pg_catalog.count(*),
         pg_catalog.count(*) filter (where scheduled_job.active is false)
  into cron_count, inactive_cron_count
  from cron.job scheduled_job
  where scheduled_job.jobname = 'classstatus-production-collector-every-minute';
  if cron_count is distinct from 1 or inactive_cron_count is distinct from 1 then
    raise exception 'classstatus:valenzuela-cleanup-production-cron-not-exactly-one-inactive';
  end if;

  if exists (
    select 1
    from public.classstatus_audit_entries audit
    where audit.deployment_namespace = 'production'
      and audit.correlation_id = migration_id
  ) then
    raise exception 'classstatus:valenzuela-cleanup-already-audited';
  end if;

  select pg_catalog.count(*) into target_count
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.provenance_type = 'automatic-collector'
    and suspension.administrative_state = 'active'
    and suspension.record ->> 'effectiveDate' = '2026-08-29'
    and suspension.record ->> 'lguId' = 'valenzuela'
    and not (suspension.record ? 'schoolId');
  if target_count is distinct from 2 then
    raise exception 'classstatus:valenzuela-cleanup-target-count-drift';
  end if;

  if exists (
    select 1
    from public.classstatus_suspensions suspension
    where suspension.deployment_namespace = 'production'
      and suspension.provenance_type = 'automatic-collector'
      and suspension.administrative_state = 'active'
      and suspension.record ->> 'effectiveDate' = '2026-08-29'
      and suspension.record ->> 'lguId' = 'valenzuela'
      and not (suspension.record ? 'schoolId')
      and suspension.record_id not in (survivor_id, retired_id)
  ) or (select pg_catalog.count(*)
        from public.classstatus_suspensions suspension
        where suspension.deployment_namespace = 'production'
          and suspension.record_id in (survivor_id, retired_id)) is distinct from 2 then
    raise exception 'classstatus:valenzuela-cleanup-target-id-drift';
  end if;

  -- Any other duplicated LGU/window on August 29 requires its own reviewed
  -- manifest. Never broaden this cleanup automatically.
  if exists (
    select 1
    from (
      select
        suspension.record ->> 'lguId' as lgu_id,
        classstatus_private.notice_family_key('production', suspension.record) as family_key,
        classstatus_private.notice_window_key(suspension.record) as window_key,
        pg_catalog.count(*) as duplicate_count
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = 'production'
        and suspension.provenance_type = 'automatic-collector'
        and suspension.administrative_state = 'active'
        and suspension.record ->> 'effectiveDate' = '2026-08-29'
        and not (suspension.record ? 'schoolId')
      group by
        suspension.record ->> 'lguId',
        classstatus_private.notice_family_key('production', suspension.record),
        classstatus_private.notice_window_key(suspension.record)
      having pg_catalog.count(*) > 1
    ) duplicate
    where duplicate.lgu_id is distinct from 'valenzuela'
       or duplicate.family_key is distinct from canonical_family
       or duplicate.window_key is distinct from 'all-day:2026-08-29'
       or duplicate.duplicate_count is distinct from 2::bigint
  ) then
    raise exception 'classstatus:valenzuela-cleanup-other-duplicate-requires-review';
  end if;

  select suspension.* into strict survivor
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.record_id = survivor_id
  for update;

  select suspension.* into strict retired
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.record_id = retired_id
  for update;

  if survivor.provenance_type is distinct from 'automatic-collector'
     or survivor.administrative_state is distinct from 'active'
     or survivor.revision is distinct from 73
     or survivor.event_key is distinct from survivor_legacy_event
     or survivor.conflict_key is distinct from legacy_conflict
     or pg_catalog.jsonb_typeof(survivor.record) is distinct from 'object'
     or pg_catalog.jsonb_typeof(survivor.record -> 'id') is distinct from 'string'
     or coalesce(survivor.record ->> 'id', '') = ''
     or survivor.record ->> 'id' is distinct from survivor_id
     or pg_catalog.jsonb_typeof(survivor.record -> 'eventKey') is distinct from 'string'
     or survivor.record ->> 'eventKey' is distinct from survivor_legacy_event
     or pg_catalog.jsonb_typeof(survivor.record -> 'lguId') is distinct from 'string'
     or survivor.record ->> 'lguId' is distinct from 'valenzuela'
     or pg_catalog.jsonb_typeof(survivor.record -> 'effectiveDate') is distinct from 'string'
     or survivor.record ->> 'effectiveDate' is distinct from '2026-08-29'
     or survivor.record ? 'schoolId'
     or pg_catalog.jsonb_typeof(survivor.record -> 'collectorProvenance') is distinct from 'object'
     or pg_catalog.jsonb_typeof(survivor.record #> '{collectorProvenance,pipeline}') is distinct from 'string'
     or survivor.record #>> '{collectorProvenance,pipeline}' is distinct from 'tier3-media'
     or survivor.record #>> '{publicationProvenance,type}' is distinct from 'automatic-collector'
     or pg_catalog.jsonb_typeof(survivor.record -> 'parserOutcome') is distinct from 'string'
     or survivor.record ->> 'parserOutcome' is distinct from 'accepted:tier3-explicit-lgu-suspension'
     or pg_catalog.jsonb_typeof(survivor.record -> 'administrativeState') is distinct from 'string'
     or survivor.record ->> 'administrativeState' is distinct from 'active'
     or pg_catalog.jsonb_typeof(survivor.record -> 'revision') is distinct from 'number'
     or survivor.record ->> 'revision' is distinct from '73'
     or pg_catalog.jsonb_typeof(survivor.record -> 'status') is distinct from 'string'
     or survivor.record ->> 'status' is distinct from 'partial-suspension'
     or pg_catalog.jsonb_typeof(survivor.record -> 'affectedLevels') is distinct from 'array'
     or survivor.record -> 'affectedLevels' is distinct from '["all-levels"]'::jsonb
     or pg_catalog.jsonb_typeof(survivor.record -> 'schoolSector') is distinct from 'string'
     or survivor.record ->> 'schoolSector' is distinct from 'all'
     or pg_catalog.jsonb_typeof(survivor.record -> 'isAllDay') is distinct from 'boolean'
     or survivor.record -> 'isAllDay' is distinct from 'true'::jsonb
     or survivor.record ? 'startTime'
     or survivor.record ? 'endTime'
     or pg_catalog.jsonb_typeof(survivor.record -> 'source') is distinct from 'object'
     or pg_catalog.jsonb_typeof(survivor.record #> '{source,id}') is distinct from 'string'
     or survivor.record #>> '{source,id}' is distinct from 'rappler-walang-pasok'
     or pg_catalog.jsonb_typeof(survivor.record #> '{source,organization}') is distinct from 'string'
     or survivor.record #>> '{source,organization}' is distinct from 'Rappler Philippines'
     or pg_catalog.jsonb_typeof(survivor.record #> '{source,url}') is distinct from 'string'
     or survivor.record #>> '{source,url}' is distinct from source_url
     or pg_catalog.jsonb_typeof(survivor.record #> '{source,evidenceFingerprint}') is distinct from 'string'
     or survivor.record #>> '{source,evidenceFingerprint}' is distinct from survivor_fingerprint
     or pg_catalog.jsonb_typeof(survivor.record #> '{source,updatedAt}') is distinct from 'string'
     or survivor.record #>> '{source,updatedAt}' is distinct from '2026-08-28T12:00:28.000Z'
     or pg_catalog.jsonb_typeof(survivor.record #> '{source,evidenceExcerpt}') is distinct from 'string'
     or survivor.record #>> '{source,evidenceExcerpt}' is distinct from survivor_excerpt
     or pg_catalog.jsonb_typeof(survivor.record #> '{source,verified}') is distinct from 'boolean'
     or survivor.record #> '{source,verified}' is distinct from 'false'::jsonb
     or pg_catalog.jsonb_typeof(survivor.record -> 'additionalSources') is distinct from 'array'
     or survivor.record -> 'additionalSources' is distinct from '[]'::jsonb
  then
    raise exception 'classstatus:valenzuela-cleanup-survivor-snapshot-drift';
  end if;

  if retired.provenance_type is distinct from 'automatic-collector'
     or retired.administrative_state is distinct from 'active'
     or retired.revision is distinct from 51
     or retired.event_key is distinct from retired_legacy_event
     or retired.conflict_key is distinct from legacy_conflict
     or pg_catalog.jsonb_typeof(retired.record) is distinct from 'object'
     or pg_catalog.jsonb_typeof(retired.record -> 'id') is distinct from 'string'
     or coalesce(retired.record ->> 'id', '') = ''
     or retired.record ->> 'id' is distinct from retired_id
     or pg_catalog.jsonb_typeof(retired.record -> 'eventKey') is distinct from 'string'
     or retired.record ->> 'eventKey' is distinct from retired_legacy_event
     or pg_catalog.jsonb_typeof(retired.record -> 'lguId') is distinct from 'string'
     or retired.record ->> 'lguId' is distinct from 'valenzuela'
     or pg_catalog.jsonb_typeof(retired.record -> 'effectiveDate') is distinct from 'string'
     or retired.record ->> 'effectiveDate' is distinct from '2026-08-29'
     or retired.record ? 'schoolId'
     or pg_catalog.jsonb_typeof(retired.record -> 'collectorProvenance') is distinct from 'object'
     or retired.record #>> '{collectorProvenance,pipeline}' is distinct from 'tier3-media'
     or retired.record #>> '{publicationProvenance,type}' is distinct from 'automatic-collector'
     or pg_catalog.jsonb_typeof(retired.record -> 'parserOutcome') is distinct from 'string'
     or retired.record ->> 'parserOutcome' is distinct from 'accepted:tier3-explicit-lgu-suspension'
     or pg_catalog.jsonb_typeof(retired.record -> 'administrativeState') is distinct from 'string'
     or retired.record ->> 'administrativeState' is distinct from 'active'
     or pg_catalog.jsonb_typeof(retired.record -> 'revision') is distinct from 'number'
     or retired.record ->> 'revision' is distinct from '51'
     or pg_catalog.jsonb_typeof(retired.record -> 'status') is distinct from 'string'
     or retired.record ->> 'status' is distinct from 'classes-suspended'
     or pg_catalog.jsonb_typeof(retired.record -> 'affectedLevels') is distinct from 'array'
     or retired.record -> 'affectedLevels' is distinct from '["all-levels"]'::jsonb
     or pg_catalog.jsonb_typeof(retired.record -> 'schoolSector') is distinct from 'string'
     or retired.record ->> 'schoolSector' is distinct from 'all'
     or pg_catalog.jsonb_typeof(retired.record -> 'isAllDay') is distinct from 'boolean'
     or retired.record -> 'isAllDay' is distinct from 'true'::jsonb
     or retired.record ? 'startTime'
     or retired.record ? 'endTime'
     or pg_catalog.jsonb_typeof(retired.record -> 'source') is distinct from 'object'
     or pg_catalog.jsonb_typeof(retired.record #> '{source,id}') is distinct from 'string'
     or retired.record #>> '{source,id}' is distinct from 'rappler-walang-pasok'
     or pg_catalog.jsonb_typeof(retired.record #> '{source,organization}') is distinct from 'string'
     or retired.record #>> '{source,organization}' is distinct from 'Rappler Philippines'
     or pg_catalog.jsonb_typeof(retired.record #> '{source,url}') is distinct from 'string'
     or retired.record #>> '{source,url}' is distinct from source_url
     or pg_catalog.jsonb_typeof(retired.record #> '{source,evidenceFingerprint}') is distinct from 'string'
     or retired.record #>> '{source,evidenceFingerprint}' is distinct from retired_fingerprint
     or pg_catalog.jsonb_typeof(retired.record #> '{source,evidenceExcerpt}') is distinct from 'string'
     or retired.record #>> '{source,evidenceExcerpt}' is distinct from retired_excerpt
     or pg_catalog.jsonb_typeof(retired.record -> 'additionalSources') is distinct from 'array'
     or retired.record -> 'additionalSources' is distinct from '[]'::jsonb
  then
    raise exception 'classstatus:valenzuela-cleanup-retired-snapshot-drift';
  end if;

  retired_source := retired.record -> 'source';

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.row_to_json(snapshot)::text, '|' order by snapshot.deployment_namespace, snapshot.record_id
  ), '')) into untouched_fingerprint_before
  from (
    select suspension.deployment_namespace, suspension.record_id, suspension.record,
      suspension.event_key, suspension.conflict_key, suspension.provenance_type,
      suspension.administrative_state, suspension.revision, suspension.published_at,
      suspension.created_at, suspension.updated_at, suspension.undo_deadline,
      suspension.removal_finalized_at
    from public.classstatus_suspensions suspension
    where not (
      suspension.deployment_namespace = 'production'
      and suspension.record_id in (survivor_id, retired_id)
    )
  ) snapshot;

  new_record := survivor.record || pg_catalog.jsonb_build_object(
    'status', 'classes-suspended',
    'affectedLevels', pg_catalog.jsonb_build_array('all-levels'),
    'schoolSector', 'all',
    'isAllDay', true,
    'eventKey', canonical_event,
    'parserOutcome', 'accepted:tier3-lgu-suspension:v2',
    'confidence', 'medium',
    'source', (survivor.record -> 'source') || pg_catalog.jsonb_build_object('verified', false),
    'additionalSources', '[]'::jsonb,
    'administrativeState', 'active',
    'revision', 74
  ) - 'startTime' - 'endTime' - 'endDate' - 'untilFurtherNotice'
    - 'removalRequestedAt' - 'undoDeadline' - 'removalFinalizedAt';

  if classstatus_private.notice_family_key('production', new_record) is distinct from canonical_family
     or classstatus_private.notice_event_key('production', new_record) is distinct from canonical_event then
    raise exception 'classstatus:valenzuela-cleanup-canonical-key-mismatch';
  end if;

  update public.classstatus_suspensions suspension
  set record = new_record,
      event_key = canonical_event,
      conflict_key = canonical_family,
      revision = 74,
      administrative_state = 'active',
      updated_at = cleanup_timestamp,
      undo_deadline = null,
      removal_finalized_at = null
  where suspension.deployment_namespace = 'production'
    and suspension.record_id = survivor_id
    and suspension.revision = 73
    and suspension.event_key = survivor_legacy_event
    and suspension.conflict_key = legacy_conflict
    and suspension.administrative_state = 'active';
  get diagnostics changed_count = row_count;
  if changed_count is distinct from 1 then
    raise exception 'classstatus:valenzuela-cleanup-survivor-stale-write';
  end if;

  insert into public.classstatus_audit_entries (
    deployment_namespace, action, outcome, record_id, target_summary,
    correlation_id, reason_code, effective_at
  ) values (
    'production', 'cleanup-canonical-rewrite', 'success', survivor_id,
    pg_catalog.jsonb_build_object(
      'recordId', survivor_id,
      'oldRevision', 73,
      'newRevision', 74,
      'oldEventKey', survivor_legacy_event,
      'newEventKey', canonical_event,
      'oldConflictKey', legacy_conflict,
      'newConflictKey', canonical_family,
      'survivingCanonicalId', survivor_id,
      'cleanupEffectiveDate', '2026-08-29',
      'cleanupMigrationIdentifier', migration_id
    )::text,
    migration_id, 'cleanup-canonical-rewrite', cleanup_timestamp
  );

  update public.classstatus_suspensions suspension
  set administrative_state = 'removed',
      removal_finalized_at = cleanup_timestamp,
      undo_deadline = null,
      revision = 52,
      updated_at = cleanup_timestamp,
      record = retired.record || pg_catalog.jsonb_build_object(
        'administrativeState', 'removed',
        'removalFinalizedAt', cleanup_timestamp,
        'revision', 52
      ) - 'removalRequestedAt' - 'undoDeadline'
  where suspension.deployment_namespace = 'production'
    and suspension.record_id = retired_id
    and suspension.revision = 51
    and suspension.event_key = retired_legacy_event
    and suspension.conflict_key = legacy_conflict
    and suspension.administrative_state = 'active';
  get diagnostics changed_count = row_count;
  if changed_count is distinct from 1 then
    raise exception 'classstatus:valenzuela-cleanup-retired-stale-write';
  end if;

  insert into public.classstatus_audit_entries (
    deployment_namespace, action, outcome, record_id, target_summary,
    correlation_id, reason_code, effective_at
  ) values (
    'production', 'cleanup-retire', 'success', retired_id,
    pg_catalog.jsonb_build_object(
      'recordId', retired_id,
      'oldRevision', 51,
      'newRevision', 52,
      'oldEventKey', retired_legacy_event,
      'newEventKey', retired_legacy_event,
      'oldConflictKey', legacy_conflict,
      'newConflictKey', legacy_conflict,
      'survivingCanonicalId', survivor_id,
      'cleanupEffectiveDate', '2026-08-29',
      'cleanupMigrationIdentifier', migration_id
    )::text,
    migration_id, 'cleanup-stale-duplicate', cleanup_timestamp
  );

  select pg_catalog.count(*) into target_count
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.provenance_type = 'automatic-collector'
    and suspension.administrative_state = 'active'
    and suspension.record ->> 'effectiveDate' = '2026-08-29'
    and suspension.record ->> 'lguId' = 'valenzuela'
    and not (suspension.record ? 'schoolId');
  if target_count is distinct from 1 then
    raise exception 'classstatus:valenzuela-cleanup-post-active-count';
  end if;

  select suspension.* into strict survivor
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.record_id = survivor_id;
  if survivor.provenance_type is distinct from 'automatic-collector'
     or survivor.administrative_state is distinct from 'active'
     or survivor.revision is distinct from 74
     or survivor.event_key is distinct from canonical_event
     or survivor.conflict_key is distinct from canonical_family
     or pg_catalog.jsonb_typeof(survivor.record -> 'id') is distinct from 'string'
     or survivor.record ->> 'id' is distinct from survivor_id
     or pg_catalog.jsonb_typeof(survivor.record -> 'eventKey') is distinct from 'string'
     or survivor.record ->> 'eventKey' is distinct from canonical_event
     or survivor.record ->> 'lguId' is distinct from 'valenzuela'
     or survivor.record ->> 'effectiveDate' is distinct from '2026-08-29'
     or survivor.record ? 'schoolId'
     or survivor.record ->> 'status' is distinct from 'classes-suspended'
     or pg_catalog.jsonb_typeof(survivor.record -> 'affectedLevels') is distinct from 'array'
     or survivor.record -> 'affectedLevels' is distinct from '["all-levels"]'::jsonb
     or survivor.record ->> 'schoolSector' is distinct from 'all'
     or pg_catalog.jsonb_typeof(survivor.record -> 'isAllDay') is distinct from 'boolean'
     or survivor.record -> 'isAllDay' is distinct from 'true'::jsonb
     or survivor.record ? 'startTime'
     or survivor.record ? 'endTime'
     or survivor.record ->> 'parserOutcome' is distinct from 'accepted:tier3-lgu-suspension:v2'
     or survivor.record ->> 'confidence' is distinct from 'medium'
     or survivor.record #>> '{collectorProvenance,pipeline}' is distinct from 'tier3-media'
     or survivor.record ->> 'administrativeState' is distinct from 'active'
     or survivor.record ->> 'revision' is distinct from '74'
     or survivor.record #>> '{source,id}' is distinct from 'rappler-walang-pasok'
     or survivor.record #>> '{source,organization}' is distinct from 'Rappler Philippines'
     or survivor.record #>> '{source,url}' is distinct from source_url
     or survivor.record #>> '{source,evidenceFingerprint}' is distinct from survivor_fingerprint
     or survivor.record #>> '{source,updatedAt}' is distinct from '2026-08-28T12:00:28.000Z'
     or survivor.record #>> '{source,evidenceExcerpt}' is distinct from survivor_excerpt
     or survivor.record #> '{source,verified}' is distinct from 'false'::jsonb
     or survivor.record -> 'additionalSources' is distinct from '[]'::jsonb
     or classstatus_private.notice_family_key('production', survivor.record) is distinct from canonical_family
     or classstatus_private.notice_event_key('production', survivor.record) is distinct from canonical_event
  then
    raise exception 'classstatus:valenzuela-cleanup-post-survivor-contract';
  end if;

  select suspension.* into strict retired
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.record_id = retired_id;
  if retired.provenance_type is distinct from 'automatic-collector'
     or retired.administrative_state is distinct from 'removed'
     or retired.revision is distinct from 52
     or retired.event_key is distinct from retired_legacy_event
     or retired.conflict_key is distinct from legacy_conflict
     or retired.record ->> 'eventKey' is distinct from retired_legacy_event
     or retired.record ->> 'parserOutcome' is distinct from 'accepted:tier3-explicit-lgu-suspension'
     or retired.record ->> 'administrativeState' is distinct from 'removed'
     or retired.record ->> 'revision' is distinct from '52'
     or retired.removal_finalized_at is null
     or pg_catalog.jsonb_typeof(retired.record -> 'removalFinalizedAt') is distinct from 'string'
     or retired.record ->> 'removalFinalizedAt' is distinct from pg_catalog.to_jsonb(cleanup_timestamp) #>> '{}'
     or retired.record -> 'source' is distinct from retired_source
     or retired.record #>> '{source,evidenceFingerprint}' is distinct from retired_fingerprint
     or retired.record #>> '{source,evidenceExcerpt}' is distinct from retired_excerpt
  then
    raise exception 'classstatus:valenzuela-cleanup-post-retired-contract';
  end if;

  select pg_catalog.count(*) into audit_count
  from public.classstatus_audit_entries audit
  where audit.deployment_namespace = 'production'
    and audit.correlation_id = migration_id;
  if audit_count is distinct from 2
     or not exists (
       select 1 from public.classstatus_audit_entries audit
       where audit.deployment_namespace = 'production'
         and audit.correlation_id = migration_id
         and audit.record_id = survivor_id
         and audit.action = 'cleanup-canonical-rewrite'
         and audit.reason_code = 'cleanup-canonical-rewrite'
         and audit.outcome = 'success'
     )
     or not exists (
       select 1 from public.classstatus_audit_entries audit
       where audit.deployment_namespace = 'production'
         and audit.correlation_id = migration_id
         and audit.record_id = retired_id
         and audit.action = 'cleanup-retire'
         and audit.reason_code = 'cleanup-stale-duplicate'
         and audit.outcome = 'success'
     )
  then
    raise exception 'classstatus:valenzuela-cleanup-post-audit-contract';
  end if;

  if exists (
    select 1
    from (
      select
        classstatus_private.notice_family_key('production', suspension.record) as family_key,
        classstatus_private.notice_window_key(suspension.record) as window_key,
        pg_catalog.count(*) as duplicate_count
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = 'production'
        and suspension.provenance_type = 'automatic-collector'
        and suspension.administrative_state = 'active'
        and suspension.record ->> 'effectiveDate' = '2026-08-29'
        and not (suspension.record ? 'schoolId')
      group by
        classstatus_private.notice_family_key('production', suspension.record),
        classstatus_private.notice_window_key(suspension.record)
      having pg_catalog.count(*) > 1
    ) duplicate
  ) then
    raise exception 'classstatus:valenzuela-cleanup-post-duplicate-window';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.row_to_json(snapshot)::text, '|' order by snapshot.deployment_namespace, snapshot.record_id
  ), '')) into untouched_fingerprint_after
  from (
    select suspension.deployment_namespace, suspension.record_id, suspension.record,
      suspension.event_key, suspension.conflict_key, suspension.provenance_type,
      suspension.administrative_state, suspension.revision, suspension.published_at,
      suspension.created_at, suspension.updated_at, suspension.undo_deadline,
      suspension.removal_finalized_at
    from public.classstatus_suspensions suspension
    where not (
      suspension.deployment_namespace = 'production'
      and suspension.record_id in (survivor_id, retired_id)
    )
  ) snapshot;
  if untouched_fingerprint_after is distinct from untouched_fingerprint_before then
    raise exception 'classstatus:valenzuela-cleanup-isolation-drift';
  end if;
end
$cleanup$;

commit;
