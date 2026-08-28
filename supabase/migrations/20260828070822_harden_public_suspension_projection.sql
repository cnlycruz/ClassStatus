-- Public consumers must trust this boundary after private publication metadata
-- has been removed. Re-check authoritative stored state before projection.
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
    and suspension.administrative_state = 'active'
    and suspension.provenance_type in ('manual-admin', 'automatic-collector')
    and suspension.record #>> '{publicationProvenance,type}' = suspension.provenance_type
    and coalesce(suspension.record -> 'isDemo', 'false'::jsonb) = 'false'::jsonb
    and (
      (
        suspension.provenance_type = 'automatic-collector'
        and suspension.record #>> '{collectorProvenance,pipeline}' = 'tier3-media'
        and suspension.record #>> '{source,id}' in (
          'rappler-walang-pasok',
          'gma-news-walang-pasok'
        )
        and suspension.record #>> '{source,reliabilityTier}' = '3'
        and suspension.record #>> '{source,type}' = 'news-reputable'
      )
      or
      (
        suspension.provenance_type = 'manual-admin'
        and suspension.record ->> 'confidence' = 'admin-verified'
        and nullif(btrim(suspension.record #>> '{manualEvidence,proofUrl}'), '') is not null
      )
    );
$$;

revoke execute on function classstatus_private.list_public_suspensions(text)
  from public, anon, authenticated, service_role;

-- The namespace-fixed wrappers remain the only public entry points.
revoke execute on function public.classstatus_preview_list_public_suspensions()
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_public_suspensions()
  from public, anon, authenticated, service_role;
grant execute on function public.classstatus_preview_list_public_suspensions()
  to anon, authenticated;
grant execute on function public.classstatus_production_list_public_suspensions()
  to anon, authenticated;
