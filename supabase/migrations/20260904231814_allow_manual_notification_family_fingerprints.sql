alter table public.classstatus_notification_events drop constraint if exists classstatus_notification_events_family_fingerprint_check;
alter table public.classstatus_notification_events add constraint classstatus_notification_events_family_fingerprint_check check (family_fingerprint ~ '^(?:v1f:[0-9a-f]{64}|manual:[0-9a-f-]{36})$');
