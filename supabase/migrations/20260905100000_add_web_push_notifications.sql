-- Private Web Push outbox. Nothing in these tables is exposed through a
-- public RPC: endpoint URLs and subscription keys are sensitive server data.
create table public.classstatus_push_subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
  endpoint text not null check (char_length(endpoint) between 1 and 2048),
  p256dh text not null check (char_length(p256dh) between 16 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  lgu_ids text[] not null check (cardinality(lgu_ids) between 1 and 17),
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (deployment_namespace, endpoint)
);

create table public.classstatus_notification_events (
  event_id uuid primary key default gen_random_uuid(),
  deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
  fingerprint text not null check (fingerprint ~ '^v1:[0-9a-f]{64}$'),
  family_fingerprint text not null check (family_fingerprint ~ '^v1f:[0-9a-f]{64}$'),
  kind text not null check (kind in ('initial', 'update')),
  record jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (deployment_namespace, fingerprint)
);

create table public.classstatus_notification_deliveries (
  delivery_id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.classstatus_notification_events(event_id) on delete cascade,
  subscription_id uuid not null references public.classstatus_push_subscriptions(subscription_id) on delete cascade,
  state text not null check (state in ('pending', 'delivered', 'failed', 'invalid')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  unique (event_id, subscription_id)
);

create index classstatus_notification_deliveries_pending_idx
  on public.classstatus_notification_deliveries (state, next_attempt_at);
create index classstatus_notification_events_family_idx
  on public.classstatus_notification_events (deployment_namespace, family_fingerprint);

alter table public.classstatus_push_subscriptions enable row level security;
alter table public.classstatus_push_subscriptions force row level security;
alter table public.classstatus_notification_events enable row level security;
alter table public.classstatus_notification_events force row level security;
alter table public.classstatus_notification_deliveries enable row level security;
alter table public.classstatus_notification_deliveries force row level security;

revoke all on table public.classstatus_push_subscriptions from public, anon, authenticated, service_role;
revoke all on table public.classstatus_notification_events from public, anon, authenticated, service_role;
revoke all on table public.classstatus_notification_deliveries from public, anon, authenticated, service_role;

create or replace function classstatus_private.notification_store(p_namespace text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  operation text := p_payload ->> 'operation'; now_at timestamptz;
  result public.classstatus_push_subscriptions%rowtype; existing public.classstatus_notification_events%rowtype;
  event_row public.classstatus_notification_events%rowtype; item jsonb; max_rows integer;
begin
  if current_setting('classstatus.notification_worker', true) <> p_namespace
     or pg_catalog.jsonb_typeof(p_payload) <> 'object' then raise exception 'classstatus:notification-proof-invalid'; end if;
  if operation = 'save-subscription' then
    if p_payload ?& array['operation','endpoint','p256dh','auth','lguIds','now'] = false
       or pg_catalog.jsonb_typeof(p_payload -> 'lguIds') <> 'array' then raise exception 'classstatus:notification-payload-invalid'; end if;
    insert into public.classstatus_push_subscriptions as subscription (deployment_namespace, endpoint, p256dh, auth, lgu_ids, active, updated_at)
    values (p_namespace, p_payload ->> 'endpoint', p_payload ->> 'p256dh', p_payload ->> 'auth', array(select jsonb_array_elements_text(p_payload -> 'lguIds')), true, (p_payload ->> 'now')::timestamptz)
    on conflict (deployment_namespace, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, lgu_ids = excluded.lgu_ids, active = true, updated_at = excluded.updated_at
    returning * into result;
    return jsonb_build_object('id', result.subscription_id, 'createdAt', result.created_at, 'updatedAt', result.updated_at);
  elsif operation = 'update-preferences' then
    update public.classstatus_push_subscriptions set lgu_ids = array(select jsonb_array_elements_text(p_payload -> 'lguIds')), updated_at = (p_payload ->> 'now')::timestamptz
    where subscription_id = (p_payload ->> 'id')::uuid and deployment_namespace = p_namespace and active;
    return found;
  elsif operation = 'deactivate-subscription' then
    update public.classstatus_push_subscriptions set active = false, updated_at = (p_payload ->> 'now')::timestamptz
    where subscription_id = (p_payload ->> 'id')::uuid and deployment_namespace = p_namespace;
    return 'null'::jsonb;
  elsif operation = 'create-event' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_payload ->> 'fingerprint', 0));
    select * into existing from public.classstatus_notification_events where deployment_namespace = p_namespace and fingerprint = p_payload ->> 'fingerprint';
    if existing.event_id is not null then return jsonb_build_object('id', existing.event_id, 'kind', existing.kind, 'createdAt', existing.created_at, 'created', false); end if;
    now_at := (p_payload ->> 'now')::timestamptz;
    insert into public.classstatus_notification_events (deployment_namespace, fingerprint, family_fingerprint, kind, record, created_at)
    values (p_namespace, p_payload ->> 'fingerprint', p_payload ->> 'familyFingerprint', case when exists(select 1 from public.classstatus_notification_events where deployment_namespace = p_namespace and family_fingerprint = p_payload ->> 'familyFingerprint') then 'update' else 'initial' end, p_payload -> 'record', now_at)
    returning * into event_row;
    insert into public.classstatus_notification_deliveries (event_id, subscription_id, state, attempts, next_attempt_at)
    select event_row.event_id, subscription.subscription_id, 'pending', 0, now_at from public.classstatus_push_subscriptions subscription
    where subscription.deployment_namespace = p_namespace and subscription.active and subscription.lgu_ids @> array[p_payload #>> '{record,lguId}'];
    return jsonb_build_object('id', event_row.event_id, 'kind', event_row.kind, 'createdAt', event_row.created_at, 'created', true);
  elsif operation = 'list-pending' then
    max_rows := least(greatest(coalesce((p_payload ->> 'limit')::integer, 100), 1), 100);
    return coalesce((select jsonb_agg(jsonb_build_object(
      'delivery', jsonb_build_object('id', delivery.delivery_id, 'eventId', delivery.event_id, 'subscriptionId', delivery.subscription_id, 'state', delivery.state, 'attempts', delivery.attempts, 'nextAttemptAt', delivery.next_attempt_at, 'lastAttemptAt', delivery.last_attempt_at, 'deliveredAt', delivery.delivered_at, 'lastErrorCode', delivery.last_error_code),
      'event', jsonb_build_object('id', event.event_id, 'deploymentNamespace', event.deployment_namespace, 'fingerprint', event.fingerprint, 'familyFingerprint', event.family_fingerprint, 'kind', event.kind, 'record', event.record, 'createdAt', event.created_at),
      'subscription', jsonb_build_object('id', subscription.subscription_id, 'deploymentNamespace', subscription.deployment_namespace, 'endpoint', subscription.endpoint, 'p256dh', subscription.p256dh, 'auth', subscription.auth, 'lguIds', subscription.lgu_ids, 'active', subscription.active, 'createdAt', subscription.created_at, 'updatedAt', subscription.updated_at)
    )) from (select * from public.classstatus_notification_deliveries where state in ('pending','failed') and next_attempt_at <= (p_payload ->> 'now')::timestamptz order by next_attempt_at limit max_rows) delivery
    join public.classstatus_notification_events event on event.event_id = delivery.event_id and event.deployment_namespace = p_namespace
    join public.classstatus_push_subscriptions subscription on subscription.subscription_id = delivery.subscription_id and subscription.active), '[]'::jsonb);
  elsif operation = 'record-delivery' then
    item := p_payload -> 'update';
    update public.classstatus_notification_deliveries set state = item ->> 'state', attempts = (item ->> 'attempts')::integer, next_attempt_at = (item ->> 'nextAttemptAt')::timestamptz, last_attempt_at = nullif(item ->> 'lastAttemptAt','')::timestamptz, delivered_at = nullif(item ->> 'deliveredAt','')::timestamptz, last_error_code = nullif(item ->> 'lastErrorCode','')
    where delivery_id = (p_payload ->> 'id')::uuid;
    return 'null'::jsonb;
  end if;
  raise exception 'classstatus:notification-operation-invalid';
end $$;

create function public.classstatus_preview_worker_notification_store(p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare payload jsonb; begin
  payload := classstatus_private.verify_preview_collector_capability('logs.append', p_payload, p_issued_at, p_nonce, p_signature, 131072);
  perform pg_catalog.set_config('classstatus.notification_worker', 'preview', true);
  return classstatus_private.notification_store('preview', payload);
end $$;
create function public.classstatus_production_worker_notification_store(p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare payload jsonb; begin
  payload := classstatus_private.verify_production_collector_capability('logs.append', p_payload, p_issued_at, p_nonce, p_signature, 131072);
  perform pg_catalog.set_config('classstatus.notification_worker', 'production', true);
  return classstatus_private.notification_store('production', payload);
end $$;
revoke execute on function public.classstatus_preview_worker_notification_store(text, bigint, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_worker_notification_store(text, bigint, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classstatus_preview_worker_notification_store(text, bigint, uuid, text) to anon;
grant execute on function public.classstatus_production_worker_notification_store(text, bigint, uuid, text) to anon;
revoke execute on all functions in schema classstatus_private from public, anon, authenticated, service_role;
