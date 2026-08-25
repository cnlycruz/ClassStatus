-- OPTIONAL POST-CUTOVER TEMPLATE -- DO NOT APPLY DURING PRODUCTION LAUNCH.
-- Convert this reviewed template into a new forward migration only after
-- Preview is retired and the Production rollback window has closed.
-- This file intentionally leaves all suspension and audit history untouched.

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'classstatus-preview-collector-every-minute'
      and active
  ) then
    raise exception 'Preview collector cron must be retired before object cleanup';
  end if;
end
$$;

revoke execute on function public.classstatus_preview_worker_acquire_collector_lease(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_worker_release_collector_lease(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_worker_upsert_collected(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_worker_append_collector_logs(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_acquire_collector_lease(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_release_collector_lease(uuid)
  from public, anon, authenticated, service_role;

drop function public.classstatus_preview_worker_acquire_collector_lease(text, bigint, uuid, text);
drop function public.classstatus_preview_worker_release_collector_lease(text, bigint, uuid, text);
drop function public.classstatus_preview_worker_upsert_collected(text, bigint, uuid, text);
drop function public.classstatus_preview_worker_append_collector_logs(text, bigint, uuid, text);
drop function public.classstatus_preview_acquire_collector_lease(uuid);
drop function public.classstatus_preview_release_collector_lease(uuid);
drop function classstatus_private.verify_preview_collector_capability(text, text, bigint, uuid, text, integer);
drop function classstatus_private.invoke_preview_collector();

-- Remove the legacy Production service-role application overloads after the
-- authenticated/signed runtime has completed its rollback window.
revoke execute on function public.classstatus_production_start_admin_session(text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_touch_admin_session(boolean, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_revoke_admin_session(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_admin_snapshot(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_create_confirmation(uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_publish_manual(jsonb, uuid, text, text, uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_mutate_lifecycle(text, text, bigint, uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_reconcile_removals(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_append_audit(text, text, text, text, text, text, timestamptz, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_audit(integer, integer, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_upsert_collected(jsonb, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_append_collector_logs(jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_collector_logs(integer, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_acquire_collector_lease(uuid)
  from service_role;
revoke execute on function public.classstatus_production_release_collector_lease(uuid)
  from service_role;

drop function public.classstatus_production_start_admin_session(text, text, uuid, uuid);
drop function public.classstatus_production_touch_admin_session(boolean, uuid, uuid);
drop function public.classstatus_production_revoke_admin_session(uuid, uuid);
drop function public.classstatus_production_admin_snapshot(uuid, uuid);
drop function public.classstatus_production_create_confirmation(uuid, text, uuid, uuid);
drop function public.classstatus_production_publish_manual(jsonb, uuid, text, text, uuid, text, uuid, uuid);
drop function public.classstatus_production_mutate_lifecycle(text, text, bigint, uuid, text, uuid, uuid);
drop function public.classstatus_production_reconcile_removals(uuid, uuid);
drop function public.classstatus_production_append_audit(text, text, text, text, text, text, timestamptz, uuid, uuid);
drop function public.classstatus_production_list_audit(integer, integer, uuid, uuid);
drop function public.classstatus_production_upsert_collected(jsonb, text, text, uuid, uuid);
drop function public.classstatus_production_append_collector_logs(jsonb, uuid, uuid);
drop function public.classstatus_production_list_collector_logs(integer, uuid, uuid);
drop function classstatus_private.start_production_admin_session(text, text, uuid, uuid);
drop function classstatus_private.touch_production_admin_session(boolean, uuid, uuid);
drop function classstatus_private.revoke_production_admin_session(uuid, uuid);
drop function classstatus_private.assert_production_service_principal(uuid, uuid);

-- Optional transient-state purge. Uncomment only after a separate, explicit
-- data-cleanup approval. These statements never touch suspensions or audit.
-- delete from public.classstatus_collector_capability_nonces
-- where deployment_namespace = 'preview';
-- delete from public.classstatus_collector_leases
-- where deployment_namespace = 'preview';
