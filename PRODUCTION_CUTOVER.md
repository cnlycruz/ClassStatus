# Class Status Production Cutover Runbook

This runbook prepares a one-way Preview → Production cutover. Do not combine
steps or retire Preview before the five-run Production soak gate passes.

## Fixed architecture

- Git: `main` only after retirement
- Vercel: Production Branch `main`
- Public origin: `https://classstatus.vercel.app`
- Supabase application namespace: `production`
- Scheduled collector: every minute
- Public dashboard refresh: every 30 seconds while visible; immediate refresh
  on return; no polling while hidden

The repository intentionally has no `vercel.json`. Confirm in Vercel Project
Settings that the Production Branch is `main`; the default Git integration then
creates Production deployments from `main` without branch-specific overrides.

## Production secrets and variables

Generate a new base64url value containing at least 32 random bytes. The encoded
value must be at least 43 characters. Never reuse the Preview cron secret.

Configure exactly these application variables in the Vercel **Production**
environment:

```text
CLASSSTATUS_STORAGE_DRIVER=supabase
CLASSSTATUS_ADMIN_USER_ID=9ccb3c4a-af27-4c0d-8870-4ee56f91e40a
CLASSSTATUS_SECURITY_PEPPER=<production value>
CLASSSTATUS_CRON_SECRET=<new production cron secret>
SUPABASE_URL=https://fyupnqsdfkqfrjcypues.supabase.co
SUPABASE_PUBLISHABLE_KEY=<existing publishable key>
CLASSSTATUS_PUBLIC_ORIGIN=https://classstatus.vercel.app
```

Do not add `NEXT_PUBLIC_` variants. Do not configure `SUPABASE_SECRET_KEY` for
the new Production runtime. The standalone import utility is the only retained
offline operation that accepts that key.

In the Supabase Vault UI, create a secret named exactly:

```text
classstatus-production-cron-secret
```

Use the exact same new value as `CLASSSTATUS_CRON_SECRET`. Do not place the
value in a migration, SQL history, source file, issue, or deployment log.

## Prepared migrations

1. `20260825203903_add_production_runtime_security_support.sql` installs the
   authenticated Production admin/manual interfaces and signed worker RPCs. It
   contains no scheduler activation and is safe to apply before deployment.
2. `20260825204234_activate_production_collector_scheduler.sql` creates the
   stable Production HTTP invoker and schedules the one-minute job. Apply it
   only after the new Production deployment is READY and verified.

Neither migration modifies or disables Preview scheduling.

## Exact cutover staging set

Only after explicit authorization, stage exactly these paths (the
`vercel.json` entry records its deletion):

```powershell
git add -- `
  .env.example `
  README.md `
  PRODUCTION_CUTOVER.md `
  vercel.json `
  src/collector/execution.ts `
  src/lib/admin/auth.ts `
  src/lib/admin/config.ts `
  src/lib/cron/collectorCapability.ts `
  src/lib/storage/supabase.ts `
  src/lib/supabase/server.ts `
  supabase/migrations/20260825203903_add_production_runtime_security_support.sql `
  supabase/migrations/20260825204234_activate_production_collector_scheduler.sql `
  supabase/optional/retire_preview_and_legacy_runtime.sql `
  tests/collectorCapability.test.ts `
  tests/cronCollector.test.ts `
  tests/nearLiveContracts.test.ts `
  tests/publicOrigin.test.ts `
  tests/scheduledCollectorExecution.test.ts `
  tests/scheduledCollectorStorage.test.ts `
  tests/securityContracts.test.ts `
  tests/storageDriver.test.ts `
  tests/supabaseAuthBoundaries.test.ts
```

Then inspect `git diff --cached`, run `git diff --cached --check`, and verify
that no unrelated branding file or `tsconfig.tsbuildinfo` is staged. Do not use
`git add .` for this cutover.

## Launch sequence

1. Confirm the working source is `deployment-preview` at or descended from
   known-good `3ae4f06`, and reconfirm that `main` is an ancestor:

   ```powershell
   git merge-base --is-ancestor main deployment-preview
   git rev-list --left-right --count main...deployment-preview
   ```

2. Configure the seven Vercel Production variables without changing Preview.
3. Create `classstatus-production-cron-secret` in Vault.
4. Apply Migration A only. Verify its migration-history entry and verify that
   `classstatus-production-collector-every-minute` does not exist.
5. Review the prepared local diff. Stage and commit only the cutover files after
   explicit authorization; preserve unrelated branding edits and
   `tsconfig.tsbuildinfo` separately.
6. Preserve unrelated edits with a named stash if needed, then promote by
   fast-forward only:

   ```powershell
   git switch main
   git merge --ff-only deployment-preview
   git push origin main
   ```

   Do not push the new cutover commit to `origin/deployment-preview`.
7. Wait for the `main` deployment to become READY. Record its deployment ID for
   rollback.
8. Before scheduler activation, verify:
   - `https://classstatus.vercel.app/` returns the dashboard;
   - `/api/lgus`, `/api/suspensions`, and `/api/schools` return successful,
     uncached Production responses;
   - Production responses contain no Preview records;
   - the existing administrator can log in;
   - the session guard is under `deployment_namespace='production'` with an
     eight-hour absolute expiry and thirty-minute idle expiry;
   - a second login replaces the first session;
   - invalid Origin and CSRF requests fail closed;
   - admin bootstrap and audit reads work;
   - manual Run Collector obtains the Production lease and uses only Production
     storage/logging.
9. Apply Migration B.
10. Verify the scheduled job definition:

    ```sql
    select jobname, schedule, command, active
    from cron.job
    where jobname in (
      'classstatus-production-collector-every-minute',
      'classstatus-preview-collector-every-minute'
    )
    order by jobname;
    ```

11. Observe at least five consecutive completed Production collector runs over
    approximately five minutes. For every run verify:
    - namespace is `production`;
    - completion and logs are recorded;
    - no second active Production lease overlaps it;
    - any suspension writes are Production-only;
    - Preview continues on its existing schedule during the soak.
12. Only after the five-run gate passes, proceed to Preview retirement.

Do not create a synthetic live suspension merely to exercise publish/remove.
Use those live paths only for a legitimate verified notice; automated tests
cover confirmation, publish, audit, removal, and undo behavior otherwise.

## Preview retirement

1. Reconfirm the Production deployment, admin login, public APIs, exact cron
   definition, and five consecutive successful runs.
2. Disable only the Preview scheduler:

   ```sql
   select cron.unschedule('classstatus-preview-collector-every-minute');
   ```

3. Observe two further minutes: Preview produces no new runs and Production
   continues successfully.
4. Remove Preview `CLASSSTATUS_CRON_SECRET` from Vercel.
5. Optionally delete `classstatus-preview-cron-secret` through the Vault UI.
6. Remove `class-status-preview.vercel.app` if it remains assigned.
7. Delete the remote branch only after all preceding checks pass:

   ```powershell
   git push origin --delete deployment-preview
   ```

8. Switch the working tree to `main`, restore any preserved unrelated edits,
   and remove the merged local branch:

   ```powershell
   git switch main
   git branch -d deployment-preview
   ```

9. Continue future development directly on `main`.

## Rollback

Before Preview retirement, stop Production scheduling without touching Preview:

```sql
select cron.unschedule('classstatus-production-collector-every-minute');
```

Restore the recorded previous Production deployment/alias and keep Migration A
and Production data in place. Do not down-migrate and do not delete Production
records. If the legacy Production application must be restored, temporarily
restore its server-only `SUPABASE_SECRET_KEY`; Migration A retains the old
service-role overloads solely for this rollback window.

After Preview retirement, restore Preview in this order if rollback is approved:

1. recreate `deployment-preview` at known-good `3ae4f06`;
2. restore the Preview alias and Preview Vercel cron secret;
3. restore `classstatus-preview-cron-secret` in Vault;
4. reschedule Preview:

   ```sql
   select cron.schedule(
     'classstatus-preview-collector-every-minute',
     '* * * * *',
     $job$select classstatus_private.invoke_preview_collector();$job$
   );
   ```

5. verify successful Preview runs before directing users back to it.

## Optional later database cleanup

`supabase/optional/retire_preview_and_legacy_runtime.sql` is deliberately
outside the migration directory. Review it and convert it to a newly generated
forward migration only after Preview retirement and the Production rollback
window close. It removes Preview worker/lease/invocation interfaces and legacy
Production service-role application overloads. It never deletes suspension or
audit history; transient nonce/lease deletion remains commented and requires a
separate explicit data-cleanup approval.
