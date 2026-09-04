# ClassStatus Project Context

Last reconciled with `main`: 2026-09-05, after commit `e7c138e` (`fix: harden notification preview and alert UX`).

This document records **current engineering truth**, not a chronological transcript. When a detail becomes
outdated, replace it here and move useful historical context to `ENGINEERING_HISTORY.md`.

## 1. What ClassStatus is

ClassStatus NCR is a Metro Manila class-suspension tracker built around the question “May pasok ba?”. Its
primary users are students checking quickly, often from a phone, with parents, teachers, and school staff as
secondary users.

The product should answer attendance status quickly while keeping the source, timing, scope, and uncertainty
visible. It is a public-service information tool, not a generic dashboard or social feed.

## 2. Product invariants

- Public scope is all 17 logical NCR LGUs.
- Caloocan can use multiple map polygons but must resolve to one logical Caloocan status.
- Manila is one city in the public status model.
- Statuses must remain evidence-backed and conservative.
- Unclear evidence is not permission to guess. Use awaiting/uncertain behavior instead.
- Dates and operational time are interpreted in `Asia/Manila`.
- The existing Class Status NCR identity, logo, status colors, typography, map-first flow, mobile-first behavior,
  dark mode, and accessibility expectations are intentional product decisions.

Read `PRODUCT.md` for the fuller product/visual contract.

## 3. Current application architecture

### Web application

- Next.js 15 App Router + React 19 + TypeScript.
- Tailwind CSS 3 and Lucide icons.
- Main public routes include `/`, `/sources`, and `/about`.
- `/collector` is the protected administrator/collector console and redirects unauthenticated users to its
  login flow.
- Public APIs expose projected information such as LGUs, suspensions, schools, alert configuration, and the
  NCR share image. Private collector/admin state must not leak through public projections.

### Storage and Production runtime

The repository supports both local JSON and Supabase-backed storage, but they have different purposes:

- Local JSON is useful for local development/tests and historical compatibility.
- Hosted Production uses the Supabase/Postgres storage path and narrow server-side/RPC boundaries.
- Production is namespaced and must remain isolated from Preview/legacy data.
- The current Production design intentionally avoids requiring a Supabase service-role/secret key in the
  hosted application runtime.
- Scheduled collector execution and its authorization/lease behavior are part of the Production architecture.

For Production-specific details, environment boundaries, scheduler behavior, rollback constraints, and RPC
security, read `PRODUCTION_CUTOVER.md` and inspect the latest migrations/code rather than copying old setup
commands from chat history.

## 4. Public dashboard behavior

The homepage is intentionally map-first.

Current important behaviors include:

- interactive NCR SVG map;
- Map/List switching;
- status filters;
- LGU detail panel;
- global school/LGU search from the navbar;
- school finder;
- source/evidence visibility;
- visibility-aware dashboard refresh;
- freshness/reliability messaging;
- share-card generation/download;
- public Web Push alert controls in the navbar;
- light/dark theme support.

The old idea of a separate homepage alerts card is no longer the desired layout. Alert controls live in the
navbar so the map content moves up naturally.

## 5. NCR map contract

The NCR map uses SVG and real geographic boundaries. A previously fragile area was gesture rendering:
CSS compositor transforms caused blurry/incomplete rendering during pinch zoom on Safari. The accepted fix
uses native SVG transforms for the map content. Do not casually replace that interaction path with a CSS
`translate3d()/scale()` snapshot approach.

Map behavior to preserve includes:

- sharp rendering while zooming/panning;
- wheel/pointer behavior that does not accidentally scroll the page when the map owns the gesture;
- sensible zoom limits/reset behavior;
- blank-map deselection;
- keyboard/accessibility contracts;
- all 17 logical LGUs represented correctly.

See `src/components/NcrInteractiveMap.tsx`, `src/lib/ncrMapInteraction.ts`, and their tests before changing
interaction math.

## 6. Collector policy

The collector is deliberately conservative.

Current policy:

- Tier 3 media collection is the operational path.
- Rappler and GMA are the intended live Tier 3 sources in the current product state.
- Tier 1/2 adapters remain unfinished/disabled and must not be silently enabled.
- Parsing/normalization requires enough explicit evidence to identify the relevant LGU, date, education scope,
  sector, and suspension action.
- Stale, ambiguous, conflicting, malformed, or unprovenanced material must not become a confident public
  suspension.
- Corroboration can strengthen confidence, but uncertainty must remain visible when evidence is insufficient.
- Lifecycle/freshness handling prevents obsolete notices from remaining live indefinitely.

Important implementation areas are under `src/collector/`, `src/lib/suspensions/`, `src/lib/freshness.ts`,
`src/lib/publicNcrProjection.ts`, and the collector/storage tests.

## 7. Admin console

The protected admin/collector surface supports operational work such as:

- running/observing the collector;
- viewing collector diagnostics/logs;
- reviewing admin/bootstrap state;
- manually publishing/removing/undoing suspension changes through protected flows;
- audit history;
- notification management and recent manual-broadcast history.

Do not bypass the existing server-side authorization, session, CSRF, Origin, namespace, or validation boundaries
for convenience. A UI problem should not be “fixed” by weakening the authoritative mutation path.

## 8. Web Push and manual notifications

The notification system contains several distinct layers:

- public subscription/config/preferences endpoints;
- service-worker push display/click behavior;
- persistent subscriptions/events/deliveries in Supabase;
- dispatch/retry/outbox behavior;
- status-change notification logic;
- protected administrator manual broadcasts;
- manual recipient preview/history.

### Important current behavior

Recipient preview is an **administrator convenience**, not the authority that determines who receives a
broadcast. The authoritative recipient calculation happens when the broadcast is created.

Therefore, if the preview-count store is temporarily unavailable, the preview route can safely return
`available: false` / `recipientCount: null`, and the admin UI may continue to a confirmation that says the
recipient count is unavailable. Validation/security errors must still fail normally. The actual send/create
endpoint remains protected and authoritative.

Do not change this back into “preview must succeed or sending is impossible” without a strong reason; that was
a real Production regression during the notification rollout.

Relevant areas include:

- `src/app/api/admin/notifications/preview/route.ts`
- `src/app/api/admin/notifications/route.ts`
- `src/app/collector/AdminCustomNotifications.tsx`
- `src/lib/admin/notifications.ts`
- `src/lib/notifications/`
- notification migrations under `supabase/migrations/`
- notification-focused tests under `tests/`

## 9. Database migration state and discipline

The repository contains a long forward migration history. Recent reliability/notification work added migrations
for collector freshness, published status history, Web Push, manual broadcasts, and the manual-notification
history grouping fix.

The grouping-fix migration is:

`supabase/migrations/20260905103000_fix_manual_notification_history_grouping.sql`

It exists because the initial history query grouped a derived relation too loosely for PostgreSQL. Treat that as
a regression lesson: when aggregating derived relations, explicitly group every selected non-aggregate value
required by PostgreSQL rather than relying on functional-dependency inference that no longer applies.

Rules for future DB changes:

- add a new forward migration;
- do not rewrite an already-applied migration to “fix Production”;
- verify grants/revokes, `security definer`, explicit `search_path`, proof checks, and namespace boundaries;
- add regression tests when practical;
- distinguish “migration exists in Git” from “migration is confirmed applied in Production”.

## 10. Service worker / PWA boundary

The service worker caches only safe static assets. `/api/`, `/collector/`, and `/auth/` are network-only by
design. Preserve that boundary so private, mutable, or authentication-sensitive responses cannot be served
from stale cache.

The service worker also handles Web Push display and notification-click navigation.

## 11. Testing and quality gates

Package scripts define the standard gates:

```bash
npm run lint
npm test
npm run build
```

Use targeted Vitest runs while iterating, then run the full relevant gates before marking non-trivial work done.
For database/runtime changes, local green tests are necessary but not sufficient evidence that Production is
healthy.

The repo also has UI/Impeccable hooks under `.codex/hooks.json` and `.agents/skills/impeccable/`. Do not delete
or bypass them just to make a visual change easier.

## 12. Source-of-truth order

When investigating a question, use this order:

1. current implementation + tests;
2. current migrations/schema contracts;
3. this `PROJECT_CONTEXT.md` for durable project state;
4. `PRODUCT.md` for product/UX intent;
5. `PRODUCTION_CUTOVER.md` for Production operations/security architecture;
6. `ENGINEERING_HISTORY.md` for past incidents and why decisions exist;
7. `KNOWN_ISSUES.md` for unresolved or verification-needed items;
8. old chat messages only as historical evidence, never as stronger truth than current code/Production evidence.

## 13. Current engineering posture

The project is beyond the prototype stage. Treat changes as Production-facing unless clearly isolated to local
development. Prefer regression-safe, tested, minimal changes over rewrites.

The immediate mindset for the recently added reliability/notification features is **stabilize and verify**:
make sure migrations, runtime behavior, delivery behavior, and admin UX agree in Production before adding more
complexity.
