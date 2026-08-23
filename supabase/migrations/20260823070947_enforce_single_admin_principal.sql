-- ClassStatus has exactly one configured administrator per isolated namespace.
-- The application also checks CLASSSTATUS_ADMIN_USER_ID, but this constraint
-- prevents an accidental second database principal from gaining direct RPC access.
create unique index classstatus_admin_principals_single_namespace_idx
  on public.classstatus_admin_principals (deployment_namespace);
