# ClassStatus Codex Guide

This file is the repository-level operating guide for Codex and other coding agents.
Keep it short enough to scan. Durable product and engineering knowledge lives in the linked docs.

## Mission

ClassStatus NCR is a public-information application that answers “May pasok ba?” for Metro Manila.
Incorrect or stale status information can mislead students, so correctness, attribution, freshness,
uncertainty, and fail-closed behavior are more important than convenience or visual novelty.

## Read before non-trivial work

1. Read `docs/PROJECT_CONTEXT.md` for the current engineering state.
2. Read `PRODUCT.md` for the product, UX, brand, and accessibility contract.
3. Read the relevant specialist document:
   - `PRODUCTION_CUTOVER.md` for Production, Supabase, Vercel, auth, cron, RPC, or migration work.
   - `docs/ENGINEERING_HISTORY.md` before fixing regressions or changing previously fragile areas.
   - `docs/KNOWN_ISSUES.md` before assuming an observed symptom is new or already solved.
   - `.agents/SEC-SKILL.md` for security-sensitive work.
4. Inspect the actual implementation, tests, and migrations before editing. Documentation can become
   stale; when code and docs disagree, determine the real current behavior and update the docs in the
   same change.

## Current technical baseline

- Node.js 22.x.
- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3.
- Vitest for automated tests.
- Production storage/auth/runtime uses Supabase/Postgres through narrow server-side/RPC boundaries.
- Local JSON storage remains a development/test capability; do not infer Production behavior from it.
- The application timezone and date semantics are `Asia/Manila`.

## Non-negotiable product/data rules

- NCR has exactly 17 logical LGUs in the public model.
- Caloocan may be geographically split for rendering, but it is one logical LGU/status.
- Never invent, infer, or fabricate a suspension to make the UI look complete.
- Ambiguous, stale, conflicting, malformed, or unprovenanced notices must fail closed or remain
  explicitly uncertain rather than becoming a confident public status.
- Preserve source attribution and supporting evidence.
- Tier 3 media collection is the only operational collector tier unless an explicit product decision
  changes the source policy and its tests. Do not silently enable unfinished Tier 1/2 adapters.
- Treat official issuers as authoritative and media as secondary reporting/corroboration according to
  the existing source policy.

## Security and Production boundaries

- Never commit credentials, secrets, tokens, private keys, passwords, VAPID private material, or
  service-role keys.
- Do not weaken admin authentication, session isolation, CSRF checks, Origin validation, request-size
  limits, RPC proof checks, namespace isolation, or least-privilege grants to make a failing request pass.
- The hosted Production runtime must not gain a Supabase service-role/secret-key dependency merely as a
  workaround. Follow `PRODUCTION_CUTOVER.md` and the current server/RPC architecture.
- Keep `/api/`, `/collector/`, and `/auth/` network-only in the service worker. Do not cache private or
  mutable application responses.
- Production mutations, live notification sends, scheduler changes, destructive cleanup, and applying
  migrations to the live database require explicit user intent. Prefer local/unit verification first.
- Do not create a synthetic live suspension just to test a Production path.

## Change workflow

1. Reproduce or understand the problem before changing code.
2. Trace behavior end-to-end when relevant: UI -> route -> server library -> storage/RPC -> migration.
3. Find the nearest existing tests before editing and preserve their contracts.
4. Make the smallest coherent fix that addresses the root cause.
5. Add or update regression tests for bugs.
6. For database changes, create a new forward migration. Do not rewrite migrations that may already be
   applied in Production.
7. For RPC/security-definer functions, preserve explicit `search_path`, proof/namespace checks, grants,
   and revokes. Review SQL aggregation/grouping carefully; this project has had a real grouping regression.
8. For UI work, preserve the public-service visual language in `PRODUCT.md`. Avoid generic SaaS styling,
   decorative complexity, unnecessary glassmorphism, or regressions in mobile/accessibility behavior.
9. If the change alters architecture, operational truth, a known issue, or a hard-won constraint, update
   the appropriate file under `docs/` in the same change.

## Verification

Use the narrowest relevant test during iteration, then run the full project gates before declaring a
non-trivial change complete:

```bash
npm run lint
npm test
npm run build
```

For a targeted Vitest file:

```bash
npx vitest run tests/<name>.test.ts
```

Do not claim Production is fixed solely because local tests pass. Production-sensitive changes also need
migration/environment/runtime verification appropriate to the change.

## Fragile areas that deserve extra care

- Suspension normalization, deduplication, conflict handling, lifecycle, and freshness.
- Supabase migrations and RPC contracts.
- Admin session/auth/security boundaries.
- Collector leases, scheduling, and Production namespace isolation.
- Web Push subscriptions, dispatch, retry/outbox behavior, and manual broadcasts.
- NCR SVG pan/zoom and cross-device layout.
- Service-worker caching boundaries.

## Current UI decisions to preserve unless intentionally redesigned

- The homepage is map-first and mobile-first.
- Global school/LGU search lives in the navbar.
- Public suspension-alert controls live in the navbar, not as a separate homepage alert card.
- Preserve the existing Class Status NCR branding, status colors, light/dark themes, and accessible
  interaction targets.

## Agent behavior

- Do not assume an old chat-reported bug is still active. Check `docs/ENGINEERING_HISTORY.md`, current
  code, migrations, and tests first.
- Do not hide root causes with broad catch blocks or fake success states. Graceful degradation is allowed
  only when the authoritative operation remains safe; the notification recipient-preview flow is the
  reference example.
- If a request is clear and safe, perform the code/setup/test work directly instead of handing the user a
  long list of manual steps.
- Report what changed, what was verified, and anything that still requires Production-only evidence.
