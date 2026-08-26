-- Keep Preview recovery unchanged while ensuring a Production invocation cannot
-- outlive the lease shared by scheduled and authenticated manual collectors.
create or replace function classstatus_private.acquire_collector_lease(
  p_namespace text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired_owner uuid;
  lease_duration interval;
begin
  perform classstatus_private.assert_collector_lease_caller(p_namespace);
  if p_owner_token is null then
    raise exception 'classstatus:collector-lease-invalid';
  end if;

  lease_duration := case p_namespace
    when 'production' then interval '7 minutes'
    else interval '5 minutes'
  end;

  insert into public.classstatus_collector_leases as lease (
    deployment_namespace,
    owner_token,
    acquired_at,
    lease_expires_at,
    updated_at
  ) values (
    p_namespace,
    p_owner_token,
    clock_timestamp(),
    clock_timestamp() + lease_duration,
    clock_timestamp()
  )
  on conflict (deployment_namespace) do update
    set owner_token = excluded.owner_token,
        acquired_at = excluded.acquired_at,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = excluded.updated_at
    where lease.lease_expires_at <= clock_timestamp()
       or lease.owner_token = excluded.owner_token
  returning owner_token into acquired_owner;

  return acquired_owner = p_owner_token;
end
$$;

revoke execute on function classstatus_private.acquire_collector_lease(text, uuid)
  from public, anon, authenticated, service_role;
