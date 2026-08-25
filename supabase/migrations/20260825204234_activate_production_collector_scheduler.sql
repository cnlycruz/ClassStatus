-- Activate only after the new main Production deployment is READY and its
-- homepage, public APIs, and authenticated administrator have been verified.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function classstatus_private.invoke_production_collector()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  select pg_catalog.btrim(secret.decrypted_secret)
    into cron_secret
  from vault.decrypted_secrets secret
  where secret.name = 'classstatus-production-cron-secret'
  order by secret.created_at desc
  limit 1;

  if cron_secret is null or pg_catalog.length(cron_secret) < 43 then
    return null;
  end if;

  select net.http_post(
    url := 'https://classstatus.vercel.app/api/cron/collector',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;

  return request_id;
end
$$;

revoke execute on function classstatus_private.invoke_production_collector()
  from public, anon, authenticated, service_role;

select cron.schedule(
  'classstatus-production-collector-every-minute',
  '* * * * *',
  $job$select classstatus_private.invoke_production_collector();$job$
);
