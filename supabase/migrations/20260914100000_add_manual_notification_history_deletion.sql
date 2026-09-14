-- Hide a manual broadcast from the administrator history without deleting its
-- event, deliveries, subscription records, or append-only audit evidence.
alter table public.classstatus_notification_events
  add column history_deleted_at timestamptz;

create or replace function classstatus_private.manual_notification_store(p_namespace text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  operation text := p_payload ->> 'operation'; event_row public.classstatus_notification_events%rowtype;
  now_at timestamptz; target_ids text[]; mode text; max_rows integer;
begin
  if p_namespace is null or p_namespace not in ('preview', 'production')
     or current_setting('classstatus.manual_notification_worker', true) is distinct from p_namespace
     or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'classstatus:manual-notification-proof-invalid'; end if;
  if operation = 'preview-manual' then
    mode := p_payload ->> 'recipientMode'; target_ids := array(select pg_catalog.jsonb_array_elements_text(coalesce(p_payload -> 'targetLguIds', '[]'::jsonb)));
    if mode not in ('all','selected-lgus') or (mode = 'selected-lgus' and cardinality(target_ids) = 0) then raise exception 'classstatus:manual-notification-invalid'; end if;
    return (select count(*) from public.classstatus_push_subscriptions subscription where subscription.deployment_namespace = p_namespace and subscription.active and (mode = 'all' or subscription.lgu_ids && target_ids));
  elsif operation = 'create-manual' then
    mode := p_payload ->> 'recipientMode'; target_ids := array(select pg_catalog.jsonb_array_elements_text(coalesce(p_payload -> 'targetLguIds', '[]'::jsonb))); now_at := (p_payload ->> 'now')::timestamptz;
    if p_payload ->> 'requestKey' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or coalesce(length(btrim(p_payload ->> 'message')),0) not between 1 and 500 or coalesce(length(btrim(p_payload ->> 'title')), 25) > 100 or mode not in ('all','selected-lgus') or (mode = 'selected-lgus' and cardinality(target_ids) = 0) then raise exception 'classstatus:manual-notification-invalid'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_payload ->> 'requestKey', 0));
    select * into event_row from public.classstatus_notification_events where deployment_namespace = p_namespace and request_key = (p_payload ->> 'requestKey')::uuid;
    if event_row.event_id is not null then return jsonb_build_object('event', jsonb_build_object('id', event_row.event_id, 'deploymentNamespace', event_row.deployment_namespace, 'fingerprint', event_row.fingerprint, 'familyFingerprint', event_row.family_fingerprint, 'kind', event_row.kind, 'title', event_row.title, 'message', event_row.message, 'recipientMode', event_row.recipient_mode, 'targetLguIds', event_row.target_lgu_ids, 'recipientCount', event_row.recipient_count, 'manualRequestKey', event_row.request_key, 'createdAt', event_row.created_at), 'created', false, 'recipientCount', event_row.recipient_count); end if;
    insert into public.classstatus_notification_events (deployment_namespace, fingerprint, family_fingerprint, kind, record, created_at, event_type, request_key, title, message, recipient_mode, target_lgu_ids, recipient_count) values (p_namespace, 'manual:' || (p_payload ->> 'requestKey'), 'manual:' || (p_payload ->> 'requestKey'), 'manual', jsonb_build_object('type','manual'), now_at, 'manual', (p_payload ->> 'requestKey')::uuid, coalesce(nullif(btrim(p_payload ->> 'title'),''), 'Class Status Announcement'), btrim(p_payload ->> 'message'), mode, target_ids, (select count(*) from public.classstatus_push_subscriptions subscription where subscription.deployment_namespace = p_namespace and subscription.active and (mode = 'all' or subscription.lgu_ids && target_ids))) returning * into event_row;
    insert into public.classstatus_notification_deliveries (event_id, subscription_id, state, attempts, next_attempt_at) select event_row.event_id, subscription.subscription_id, 'pending', 0, now_at from public.classstatus_push_subscriptions subscription where subscription.deployment_namespace = p_namespace and subscription.active and (mode = 'all' or subscription.lgu_ids && target_ids);
    return jsonb_build_object('event', jsonb_build_object('id', event_row.event_id, 'deploymentNamespace', event_row.deployment_namespace, 'fingerprint', event_row.fingerprint, 'familyFingerprint', event_row.family_fingerprint, 'kind', 'manual', 'title', event_row.title, 'message', event_row.message, 'recipientMode', event_row.recipient_mode, 'targetLguIds', event_row.target_lgu_ids, 'recipientCount', event_row.recipient_count, 'manualRequestKey', event_row.request_key, 'createdAt', event_row.created_at), 'created', true, 'recipientCount', event_row.recipient_count);
  elsif operation = 'delete-manual-history' then
    if p_payload ?& array['operation','id','now'] = false or p_payload - array['operation','id','now'] <> '{}'::jsonb or pg_catalog.jsonb_typeof(p_payload -> 'id') <> 'string' or pg_catalog.jsonb_typeof(p_payload -> 'now') <> 'string' or p_payload ->> 'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'classstatus:manual-notification-history-invalid'; end if;
    update public.classstatus_notification_events set history_deleted_at = (p_payload ->> 'now')::timestamptz where event_id = (p_payload ->> 'id')::uuid and deployment_namespace = p_namespace and event_type = 'manual' and history_deleted_at is null returning * into event_row;
    return jsonb_build_object('deleted', event_row.event_id is not null);
  elsif operation = 'list-manual-history' then
    max_rows := least(greatest(coalesce((p_payload ->> 'limit')::integer,10),1),20);
    return coalesce((select jsonb_agg(summary.item order by summary.created_at desc) from (select event.created_at, jsonb_build_object('id', event.event_id, 'title', event.title, 'message', event.message, 'recipientMode', event.recipient_mode, 'targetLguIds', event.target_lgu_ids, 'recipientCount', event.recipient_count, 'createdAt', event.created_at, 'deliveredCount', count(*) filter (where delivery.state = 'delivered'), 'pendingCount', count(*) filter (where delivery.state in ('pending','failed')), 'failedCount', count(*) filter (where delivery.state = 'failed')) as item from (select * from public.classstatus_notification_events where deployment_namespace = p_namespace and event_type = 'manual' and history_deleted_at is null order by created_at desc limit max_rows) event left join public.classstatus_notification_deliveries delivery on delivery.event_id = event.event_id group by event.event_id, event.created_at, event.title, event.message, event.recipient_mode, event.target_lgu_ids, event.recipient_count) summary), '[]'::jsonb);
  end if;
  raise exception 'classstatus:manual-notification-operation-invalid';
end $$;

revoke execute on function classstatus_private.manual_notification_store(text, jsonb) from public, anon, authenticated, service_role;
