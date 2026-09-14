-- Bound anonymous push registration with atomic, namespace-scoped counters.
-- Only keyed HMAC digests are retained; raw client addresses are never stored.
create table public.classstatus_push_registration_limits (
  deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
  identity_hash text not null check (identity_hash ~ '^[0-9a-f]{64}$'),
  window_kind text not null check (window_kind in ('burst', 'daily')),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  new_endpoint_count integer not null check (new_endpoint_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (deployment_namespace, identity_hash, window_kind, window_started_at)
);

create index classstatus_push_registration_limits_expiry_idx
  on public.classstatus_push_registration_limits (window_started_at);

alter table public.classstatus_push_registration_limits enable row level security;
alter table public.classstatus_push_registration_limits force row level security;
revoke all on table public.classstatus_push_registration_limits from public, anon, authenticated, service_role;

create function classstatus_private.register_push_subscription(p_namespace text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  now_at timestamptz := pg_catalog.clock_timestamp();
  endpoint_value text; p256dh_value text; auth_value text; identity_value text; target_ids text[];
  is_new_endpoint boolean; burst_start timestamptz; daily_start timestamptz;
  burst public.classstatus_push_registration_limits%rowtype;
  daily public.classstatus_push_registration_limits%rowtype;
  result public.classstatus_push_subscriptions%rowtype;
  retry_after integer := 0;
begin
  if p_namespace is null or p_namespace not in ('preview', 'production')
     or current_setting('classstatus.notification_registration_worker', true) is distinct from p_namespace
     or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
  then raise exception 'classstatus:notification-proof-invalid'; end if;

  if p_payload ?& array['endpoint','p256dh','auth','lguIds','identityHash'] = false
     or p_payload - array['endpoint','p256dh','auth','lguIds','identityHash'] <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(p_payload -> 'endpoint') <> 'string'
     or pg_catalog.jsonb_typeof(p_payload -> 'p256dh') <> 'string'
     or pg_catalog.jsonb_typeof(p_payload -> 'auth') <> 'string'
     or pg_catalog.jsonb_typeof(p_payload -> 'lguIds') <> 'array'
     or pg_catalog.jsonb_typeof(p_payload -> 'identityHash') <> 'string'
  then raise exception 'classstatus:notification-payload-invalid'; end if;

  endpoint_value := p_payload ->> 'endpoint';
  p256dh_value := p_payload ->> 'p256dh';
  auth_value := p_payload ->> 'auth';
  identity_value := p_payload ->> 'identityHash';
  target_ids := array(select pg_catalog.jsonb_array_elements_text(p_payload -> 'lguIds'));
  if pg_catalog.length(endpoint_value) > 2048
     or endpoint_value !~ '^https://(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)+push\.apple\.com|notify\.windows\.com|(?:[a-z0-9-]+\.)+notify\.windows\.com)/[^#[:space:]\\]+$'
     or p256dh_value !~ '^[A-Za-z0-9_-]{87}$'
     or auth_value !~ '^[A-Za-z0-9_-]{22}$'
     or identity_value !~ '^[0-9a-f]{64}$'
     or pg_catalog.cardinality(target_ids) not between 1 and 17
     or not (target_ids <@ array['caloocan','las-pinas','makati','malabon','mandaluyong','manila','marikina','muntinlupa','navotas','paranaque','pasay','pasig','pateros','quezon-city','san-juan','taguig','valenzuela']::text[])
  then raise exception 'classstatus:notification-payload-invalid'; end if;

  select not exists (
    select 1 from public.classstatus_push_subscriptions subscription
    where subscription.deployment_namespace = p_namespace and subscription.endpoint = endpoint_value
  ) into is_new_endpoint;
  burst_start := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from now_at) / 600) * 600);
  daily_start := pg_catalog.date_trunc('day', now_at, 'UTC');

  delete from public.classstatus_push_registration_limits
  where window_started_at < now_at - interval '2 days';

  insert into public.classstatus_push_registration_limits as limits
    (deployment_namespace, identity_hash, window_kind, window_started_at, attempt_count, new_endpoint_count, updated_at)
  values (p_namespace, identity_value, 'burst', burst_start, 1, case when is_new_endpoint then 1 else 0 end, now_at)
  on conflict (deployment_namespace, identity_hash, window_kind, window_started_at)
  do update set attempt_count = limits.attempt_count + 1,
    new_endpoint_count = limits.new_endpoint_count + excluded.new_endpoint_count,
    updated_at = excluded.updated_at
  returning * into burst;

  insert into public.classstatus_push_registration_limits as limits
    (deployment_namespace, identity_hash, window_kind, window_started_at, attempt_count, new_endpoint_count, updated_at)
  values (p_namespace, identity_value, 'daily', daily_start, 1, case when is_new_endpoint then 1 else 0 end, now_at)
  on conflict (deployment_namespace, identity_hash, window_kind, window_started_at)
  do update set attempt_count = limits.attempt_count + 1,
    new_endpoint_count = limits.new_endpoint_count + excluded.new_endpoint_count,
    updated_at = excluded.updated_at
  returning * into daily;

  if burst.attempt_count > 60 or (is_new_endpoint and burst.new_endpoint_count > 30) then
    retry_after := greatest(retry_after, pg_catalog.ceil(extract(epoch from burst_start + interval '10 minutes' - now_at))::integer);
  end if;
  if daily.attempt_count > 600 or (is_new_endpoint and daily.new_endpoint_count > 200) then
    retry_after := greatest(retry_after, pg_catalog.ceil(extract(epoch from daily_start + interval '1 day' - now_at))::integer);
  end if;
  if retry_after > 0 then
    return pg_catalog.jsonb_build_object('rateLimited', true, 'retryAfter', retry_after);
  end if;

  insert into public.classstatus_push_subscriptions as subscription
    (deployment_namespace, endpoint, p256dh, auth, lgu_ids, active, updated_at)
  values (p_namespace, endpoint_value, p256dh_value, auth_value, target_ids, true, now_at)
  on conflict (deployment_namespace, endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    lgu_ids = excluded.lgu_ids,
    active = true,
    updated_at = excluded.updated_at
  returning * into result;
  return pg_catalog.jsonb_build_object(
    'rateLimited', false,
    'id', result.subscription_id,
    'createdAt', result.created_at,
    'updatedAt', result.updated_at
  );
end $$;

revoke execute on function classstatus_private.register_push_subscription(text, jsonb)
  from public, anon, authenticated, service_role;

create function public.classstatus_preview_worker_register_push_subscription(
  p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
  payload := classstatus_private.verify_preview_collector_capability(
    'logs.append', p_payload, p_issued_at, p_nonce, p_signature, 8192
  );
  perform set_config('classstatus.notification_registration_worker', 'preview', true);
  return classstatus_private.register_push_subscription('preview', payload);
end $$;

create function public.classstatus_production_worker_register_push_subscription(
  p_payload text, p_issued_at bigint, p_nonce uuid, p_signature text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
  payload := classstatus_private.verify_production_collector_capability(
    'logs.append', p_payload, p_issued_at, p_nonce, p_signature, 8192
  );
  perform set_config('classstatus.notification_registration_worker', 'production', true);
  return classstatus_private.register_push_subscription('production', payload);
end $$;

revoke execute on function public.classstatus_preview_worker_register_push_subscription(text,bigint,uuid,text)
  from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_worker_register_push_subscription(text,bigint,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.classstatus_preview_worker_register_push_subscription(text,bigint,uuid,text) to anon;
grant execute on function public.classstatus_production_worker_register_push_subscription(text,bigint,uuid,text) to anon;
