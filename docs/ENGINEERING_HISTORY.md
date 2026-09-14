# ClassStatus Engineering History

This document preserves **high-value engineering memory**: incidents, regressions, rejected approaches, and
lessons that are easy to lose when a chat or Codex session ends.

It is not the current bug list. Resolved incidents stay here so future agents understand why certain constraints
exist. See `KNOWN_ISSUES.md` for things that still need action or Production verification.

## Status labels

- **RESOLVED IN CODE** — the repository contains the intended fix and regression protection.
- **VERIFIED IN PRODUCTION** — runtime/database behavior was explicitly checked after deployment.
- **VERIFY IN PRODUCTION** — code is fixed, but Git alone cannot prove the live environment matches it.
- **INTENTIONAL DECISION** — behavior was deliberately chosen; do not undo it as “cleanup” without a reason.

## 2026-09-15 — Zero-candidate source checks appeared as Unknown in Collector Health

**Status:** RESOLVED IN CODE; verify after Production deployment

### Root cause and fix

The collector engine already logged structured discovery health, including `reachable_no_candidates`, but the
admin health derivation ignored it and inferred attempts and successes from human-readable message prefixes.
The zero-candidate success message began with `Discovery succeeded`, which the accepted `Discovery healthy` and
`Discovery reachable` patterns did not match. The source therefore vanished from attempt, success, and latest-run
counts despite a successful request. The overview card separately read process-local mutable source configuration,
which is not durable across collector and admin serverless requests, instead of the persisted-log health model.

Collector Health now treats the structured discovery status as authoritative. Healthy and reachable-with-no-
candidates observations count as successful attempts; degraded, blocked, and failed observations count as failed
attempts. Legacy message parsing remains only for persisted pre-structure logs. Latest-run denominators use the
same enabled operational Tier 3 registry as collector eligibility, so a missing source observation is visible as
an incomplete sweep instead of a misleading smaller denominator.
The overview count now uses that same derived health model.

### Lesson

Operational state must be carried by typed data, not log prose. A successful check that finds no relevant items is
still a successful source execution, and expected-source denominators must not be inferred only from observations
that happened to be recognized.

---

## 2026-09-14 — Valid GMA NCR entries were rejected by an unrelated article-wide restriction

**Status:** RESOLVED IN CODE; verify after Production deployment

### Symptom

The one-minute collector fetched a real GMA class-suspension tracker but published none of its valid Metro Manila
entries. Manual publication was required.

### Root cause and fix

The Tier 3 normalizer applied `UNSUPPORTED_RESTRICTION` to the entire article before splitting it into logical
statements. GMA's standard introduction said classes were suspended in “some areas,” and the September 9 article
also contained a Pampanga-only `maliban sa` exception. Either unrelated phrase rejected the whole article as
`unsupported-restricted-scope`, including explicit unrestricted NCR entries.

Restriction checks are now statement-scoped. A shared article lead may establish the suspension action without
transferring its generic “some areas” wording to an explicit LGU entry. Same-statement restrictions and adjacent
trailing exception lines remain fail-closed. Combined non-NCR headings such as `REGION III - CENTRAL LUZON` also
end NCR context. Partial candidate-article parsing is reported as degraded and cannot refresh the last-complete-
sweep timestamp.

### Lesson

Fail-closed checks must follow the same semantic boundary as the fact they qualify. Do not apply one location's
restriction to independent entries in a multi-region tracker, and do not call partial candidate processing a fully
successful source check.

---

## 2026-08-30 — Live Operations complexity was removed

**Status:** INTENTIONAL DECISION

Earlier admin work experimented with live-operation features such as traffic/presence/announcement-style
activity. That added operational complexity without being central to the collector’s main job. The later design
removed Live Operations traffic/presence/announcements and kept the useful line-by-line collector stream inside
Collector Diagnostics.

### Lesson

Do not casually reintroduce active-visitor/presence infrastructure into the admin console. If a future feature
needs realtime presence, justify it separately instead of treating the old feature as accidentally missing.

---

## 2026-08-31 — Cross-device dashboard and local-network asset stability

**Status:** RESOLVED IN CODE

The dashboard needed stabilization across device sizes and local-network development. Work in this period fixed
cross-device layout/update behavior and a development LAN asset-delivery problem.

### Lesson

When changing layout, do not test only on a large desktop. The product is mobile-first and must remain usable on
small phones, ordinary laptops, and lower-powered hardware. Treat responsive behavior and asset loading as
functional requirements, not cosmetic polish.

---

## 2026-09-01 — Safari pinch-zoom map rendering regression

**Status:** RESOLVED IN CODE

### Symptom

During pinch zoom, Safari could show blurry labels and visually incomplete map content.

### Root cause

The map interaction path relied on compositor-style CSS transforms (`translate3d`/`scale`) that effectively
produced a transformed snapshot rather than keeping the full SVG scene sharply rendered during the gesture.

### Fix

The accepted implementation moved gesture transforms onto the SVG content itself, updating the map’s SVG
transform during animation frames. The relevant code now lives in `NcrInteractiveMap.tsx` and
`ncrMapInteraction.ts`, with regression tests.

### Lesson

Do not “optimize” map gestures back to the old CSS transform approach without proving that Safari pinch zoom,
sharpness, full-map rendering, selection, reset, and wheel behavior all remain correct.

---

## 2026-09-14 — Mobile one-finger map pan pointer-capture regression

**Status:** RESOLVED IN CODE; verify on physical iOS Safari and Android Chrome after deployment

### Symptom

One-finger map panning could advance for one movement and then stop until the user lifted and touched again,
while two-finger pinch zoom continued to work.

### Root cause and fix

Commit `1640ffe` deferred pointer capture until the one-finger drag threshold was crossed. Mobile browsers could
therefore take ownership of the gesture before the map captured its first contact. Restore capture on
`pointerdown`, as in the earlier interaction implementation, while keeping movement-threshold state separate for
tap-versus-drag selection suppression. The map’s scoped `touch-none`, native SVG transforms, and RAF scheduling
remain unchanged.

### Lesson

Pointer capture is required to preserve the pointer stream; it must not be coupled to whether a gesture has moved
far enough to suppress an LGU tap. Keep `pointercancel` cleanup on the shared gesture-finalization path.

---

## 2026-09-04 to 2026-09-05 — Reliability, status history, Web Push, and admin broadcasts

**Status:** RESOLVED IN CODE; latest Production parity must still be verified when relevant

A larger reliability pass added collector freshness, published status history, Web Push subscriptions/delivery,
admin manual broadcasts, and related admin UX.

The important incident from this rollout is below because it involved both application behavior and database
migration state and was diagnosed partly outside the Codex session.

### Incident: admin notification preview failed

The administrator’s custom-notification flow called:

`POST /api/admin/notifications/preview`

During the rollout, Production could return a server error while trying to read the recipient preview. The UI
originally treated a successful preview count as a hard prerequisite, so a non-authoritative convenience read
could block the entire manual-send flow.

At the same time, notification-history/bootstrap SQL exposed a PostgreSQL grouping problem (`42803`). The
initial manual-history query grouped a derived relation only by event ID; PostgreSQL could not infer the needed
functional dependency through that derived relation.

### Database fix

Migration:

`20260905103000_fix_manual_notification_history_grouping.sql`

rewrote the manual notification store/history query so the selected non-aggregate event fields are grouped
explicitly.

The migration file itself explains that the old query could make authenticated bootstrap fail before optional
history rendered.

### Application hardening

Recipient preview was reclassified correctly as a convenience rather than authority.

Current behavior:

- validation/security errors still fail normally;
- a known recipient-preview storage outage is represented as preview unavailable;
- the UI can confirm a send with “recipient count unavailable” instead of being hard-blocked;
- recipient calculation at broadcast creation remains authoritative;
- broadcast creation is idempotent through its request key;
- push-dispatch failure is separated from event creation so delivery can be retried safely.

### Chat-side Production evidence on 2026-09-05

The engineering session separately verified that direct Production SQL could return recipient counts and manual
history after the grouping correction. Raw Vercel function logs were not available from that workspace, so the
absence of those logs should not be mistaken for proof that a route did or did not execute.

### Lesson

A read-only preview should not become a single point of failure for a separately protected authoritative
mutation when the mutation can safely calculate the truth itself. At the same time, do not use graceful
degradation to hide validation, authorization, or integrity failures.

When a notification issue appears, trace the full chain:

`AdminCustomNotifications -> API route -> admin notifications lib -> notification storage -> Supabase RPC -> migration/runtime state`

Do not assume the React component is the root cause.

---

## 2026-09-05 — Alerts moved out of the homepage content area

**Status:** INTENTIONAL DECISION

A separate alerts card on the homepage was removed so the main map content could move upward. Public alert
controls are now integrated into the navbar through `SuspensionAlerts`.

### Lesson

Do not re-add a large homepage alert card merely because the `SuspensionAlerts` component still exists. The
component is intentionally used by the navbar.

---

## Persistent engineering lessons

### Production truth is not the same as repository truth

A migration being present in Git does not prove it has been applied to Supabase Production. A route passing
unit tests does not prove Vercel has the expected environment/configuration. For Production incidents, verify the
live migration/runtime state before inventing a second code fix.

### Prefer root-cause fixes over UI masking

ClassStatus has several layers — UI, route handlers, server libraries, RPC/storage, migrations, and external
runtime configuration. Diagnose across those layers before patching the first visible error.

### Preserve fail-closed public data behavior

The collector’s conservative behavior is intentional. A “no result” or “awaiting information” state is safer
than publishing an inferred suspension based on weak evidence.

### Keep resolved history separate from active issues

When an incident is fixed, keep the lesson here but remove it from `KNOWN_ISSUES.md`. This prevents future Codex
sessions from treating old failures as current work.
