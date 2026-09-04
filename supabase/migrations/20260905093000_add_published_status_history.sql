-- Canonical final published state per LGU/date. It is fed only from the
-- existing guarded publication table, never from collector candidates or logs.
create table public.classstatus_published_status_history (
  deployment_namespace text not null check (deployment_namespace in ('preview', 'production')),
  lgu_id text not null,
  school_id text not null default '',
  effective_date date not null,
  record jsonb not null,
  primary key (deployment_namespace, lgu_id, school_id, effective_date)
);
alter table public.classstatus_published_status_history enable row level security;
alter table public.classstatus_published_status_history force row level security;
revoke all on table public.classstatus_published_status_history from public, anon, authenticated, service_role;

create or replace function classstatus_private.capture_published_status_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.administrative_state <> 'active' then
    delete from public.classstatus_published_status_history
    where deployment_namespace = new.deployment_namespace and lgu_id = new.record ->> 'lguId'
      and school_id = coalesce(new.record ->> 'schoolId', '')
      and effective_date = (new.record ->> 'effectiveDate')::date;
    return new;
  end if;
  insert into public.classstatus_published_status_history as history (deployment_namespace, lgu_id, school_id, effective_date, record)
  values (new.deployment_namespace, new.record ->> 'lguId', coalesce(new.record ->> 'schoolId', ''), (new.record ->> 'effectiveDate')::date, new.record)
  on conflict (deployment_namespace, lgu_id, school_id, effective_date) do update set record = excluded.record;
  return new;
end $$;
create trigger classstatus_capture_published_status_history
after insert or update of record, administrative_state on public.classstatus_suspensions
for each row execute function classstatus_private.capture_published_status_history();

insert into public.classstatus_published_status_history (deployment_namespace, lgu_id, school_id, effective_date, record)
select distinct on (
  deployment_namespace,
  record ->> 'lguId',
  coalesce(record ->> 'schoolId', ''),
  (record ->> 'effectiveDate')::date
)
  deployment_namespace,
  record ->> 'lguId',
  coalesce(record ->> 'schoolId', ''),
  (record ->> 'effectiveDate')::date,
  record
from public.classstatus_suspensions
where administrative_state = 'active'
order by
  deployment_namespace,
  record ->> 'lguId',
  coalesce(record ->> 'schoolId', ''),
  (record ->> 'effectiveDate')::date,
  updated_at desc,
  revision desc,
  record_id desc
on conflict (deployment_namespace, lgu_id, school_id, effective_date) do update set record = excluded.record;

create or replace function classstatus_private.list_public_status_history(p_namespace text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(record - 'administrativeState' - 'revision' - 'eventKey' - 'collectorProvenance' - 'parserOutcome' - 'fullAnnouncementText' order by effective_date desc), '[]'::jsonb)
  from public.classstatus_published_status_history
  where deployment_namespace = p_namespace and school_id = ''
    and coalesce(record -> 'isDemo', 'false'::jsonb) = 'false'::jsonb
    and (
      (record #>> '{publicationProvenance,type}' = 'automatic-collector'
       and record #>> '{collectorProvenance,pipeline}' = 'tier3-media'
       and record #>> '{source,id}' in ('rappler-walang-pasok', 'gma-news-walang-pasok'))
      or
      (record #>> '{publicationProvenance,type}' = 'manual-admin'
       and record ->> 'confidence' = 'admin-verified')
    );
$$;
create function public.classstatus_preview_list_public_status_history() returns jsonb language sql stable security definer set search_path = '' as $$ select classstatus_private.list_public_status_history('preview'); $$;
create function public.classstatus_production_list_public_status_history() returns jsonb language sql stable security definer set search_path = '' as $$ select classstatus_private.list_public_status_history('production'); $$;
revoke execute on all functions in schema classstatus_private from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_preview_list_public_status_history() from public, anon, authenticated, service_role;
revoke execute on function public.classstatus_production_list_public_status_history() from public, anon, authenticated, service_role;
grant execute on function public.classstatus_preview_list_public_status_history() to anon, authenticated;
grant execute on function public.classstatus_production_list_public_status_history() to anon, authenticated;
