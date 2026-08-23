-- Supabase grants EXECUTE to API roles when functions are created. Reset every
-- ClassStatus wrapper to a deny-by-default ACL, then grant only the intended
-- namespace/role combinations.
do $block$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'classstatus\_%' escape '\'
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated, service_role',
      fn.signature
    );
  end loop;
end
$block$;

-- Safe public projections and pre-authentication throttling only.
grant execute on function public.classstatus_preview_list_public_suspensions() to anon, authenticated;
grant execute on function public.classstatus_production_list_public_suspensions() to anon, authenticated;
grant execute on function public.classstatus_preview_check_login_throttle(text) to anon, authenticated;
grant execute on function public.classstatus_production_check_login_throttle(text) to anon, authenticated;
grant execute on function public.classstatus_preview_record_login_failure(text) to anon, authenticated;
grant execute on function public.classstatus_production_record_login_failure(text) to anon, authenticated;

-- Supabase-authenticated users may reach the supplemental session-policy RPCs;
-- each RPC still verifies the immutable configured administrator UUID.
grant execute on function public.classstatus_preview_start_admin_session(text, text) to authenticated;
grant execute on function public.classstatus_production_start_admin_session(text, text) to authenticated;
grant execute on function public.classstatus_preview_touch_admin_session(boolean) to authenticated;
grant execute on function public.classstatus_production_touch_admin_session(boolean) to authenticated;
grant execute on function public.classstatus_preview_revoke_admin_session() to authenticated;
grant execute on function public.classstatus_production_revoke_admin_session() to authenticated;

-- Preview mutations use the authenticated admin JWT. Production mutations are
-- intentionally absent from this grant set and remain server/service-role only.
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
grant execute on function public.classstatus_preview_import_suspensions(jsonb) to service_role;
grant execute on function public.classstatus_production_import_suspensions(jsonb) to service_role;

revoke execute on all functions in schema classstatus_private
  from public, anon, authenticated, service_role;

-- The primary key begins with namespace; add the reverse lookup used by the
-- immutable auth-user foreign key and administrator checks.
create index if not exists classstatus_admin_principals_user_id_idx
  on public.classstatus_admin_principals (user_id);
