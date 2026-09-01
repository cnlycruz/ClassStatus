-- Retire the short-lived Live Operations experiment while preserving the
-- near-realtime collector log append path used by Collector Diagnostics.

-- Public wrappers: traffic / presence / announcements only.
drop function if exists public.classstatus_preview_touch_presence(uuid, text, text);
drop function if exists public.classstatus_production_touch_presence(uuid, text, text);

drop function if exists public.classstatus_preview_record_visit(uuid);
drop function if exists public.classstatus_production_record_visit(uuid);

drop function if exists public.classstatus_preview_current_announcement();
drop function if exists public.classstatus_production_current_announcement();

drop function if exists public.classstatus_preview_create_announcement(text);
drop function if exists public.classstatus_production_create_announcement(text);

drop function if exists public.classstatus_preview_list_announcements(integer);
drop function if exists public.classstatus_production_list_announcements(integer);

drop function if exists public.classstatus_preview_admin_traffic_metrics();
drop function if exists public.classstatus_production_admin_traffic_metrics();

-- Private helpers used exclusively by the removed features.
drop function if exists classstatus_private.touch_site_presence(text, uuid, text, text);
drop function if exists classstatus_private.record_site_visit(text, uuid);
drop function if exists classstatus_private.current_announcement(text);
drop function if exists classstatus_private.create_announcement(text, text);
drop function if exists classstatus_private.list_announcements(text, integer);
drop function if exists classstatus_private.admin_traffic_metrics(text);

-- Remove the no-longer-collected public traffic and announcement data.
drop table if exists public.classstatus_site_presence;
drop table if exists public.classstatus_site_visits;
drop table if exists public.classstatus_announcements;

-- Intentionally retained:
--   classstatus_private.append_collector_logs(...)
-- and its worker/public wrappers. Collector Diagnostics uses that path for the
-- live line-by-line console and the existing bounded collector log history.
