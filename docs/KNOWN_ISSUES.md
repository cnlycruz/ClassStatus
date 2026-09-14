# ClassStatus Known Issues and Verification Ledger

This file contains only **currently unresolved, intentionally limited, or Production-verification-dependent**
items. Historical fixed bugs belong in `ENGINEERING_HISTORY.md`.

Last reviewed: 2026-09-14.

## Current severity summary

No open Production-blocking defect is confirmed by the repository/context review that created this file.
The items below are limitations or things that must be verified against the live environment when relevant.

## 1. Push-registration browser verification and distributed abuse remain limited

**Type:** VERIFY IN PRODUCTION / RESIDUAL AVAILABILITY RISK

The repository now rate-limits anonymous push registration through atomic, namespace-scoped Supabase counters
keyed by an HMAC digest of Vercel's platform client-IP header. New-endpoint creation and total retries have separate
burst and daily ceilings, duplicate endpoints remain idempotent, and expired counter rows are removed automatically.

Migration `20260914090000_rate_limit_push_registration.sql` was applied to and verified in Production on
2026-09-14. The matching application code was deployed to Vercel Production on the same date. Controlled Production
checks confirmed generic rejection of malformed JSON and an incorrect content type, with no related 5xx or RPC errors.
A legitimate registration and duplicate retry still require a controlled browser subscription; do not fabricate a
Production endpoint for this check. Distributed clients or a proxy placed in front of Vercel can still require a
trusted proxy/WAF policy; do not replace the shared limiter with a process-local counter or caller-supplied IP header.

## 2. Recipient-preview degraded mode is intentional

**Type:** EXPECTED DEGRADED BEHAVIOR, NOT BY ITSELF A BUG

The manual-notification preview can report that the recipient count is unavailable. This is intentional when the
known preview storage read is temporarily unavailable. The authoritative recipient calculation occurs when the
broadcast is created.

### Escalate only when

- validation/security errors are being swallowed;
- the authoritative send/create endpoint also fails;
- the wrong recipients are selected;
- idempotency is broken;
- delivery/outbox retries are lost;
- the UI claims a send succeeded when event creation did not succeed.

Do not restore the old behavior where a preview-count outage automatically blocks a safe authoritative send.

## 3. Notification delivery requires runtime configuration and real subscriptions

**Type:** PRODUCTION/ENVIRONMENT DEPENDENCY

Code and SQL tests cannot fully prove browser permission, active push subscriptions, VAPID/runtime configuration,
or push-provider delivery in the deployed environment.

When troubleshooting, separate these stages:

1. subscription/config availability;
2. subscription persistence and LGU preferences;
3. event/broadcast creation;
4. delivery-row/outbox creation;
5. dispatch attempt;
6. provider response/retry state;
7. browser/service-worker display.

Do not collapse all of these into “notifications are broken.”

## 4. Collector source coverage is intentionally limited

**Type:** PRODUCT LIMITATION / INTENTIONAL

Only the approved Tier 3 media collection path is operational in the current product state, with Rappler and GMA
as the intended live media sources. Tier 1/2 adapters are not production-ready.

This means ClassStatus can legitimately remain in an awaiting-information state even when an announcement exists
somewhere the active collector does not yet cover.

Do not solve this by silently enabling incomplete adapters or by lowering evidence requirements.

## 5. External source HTML can change

**Type:** ONGOING OPERATIONAL RISK

Media-source parsers depend on external pages/feeds that ClassStatus does not control. A source can change markup,
redirect behavior, publication metadata, or access characteristics without a code deployment.

When a source stops producing records:

- inspect collector diagnostics and the source response;
- determine whether discovery, fetching, extraction, normalization, freshness, or validation rejected it;
- update fixtures/tests with the smallest source-specific fix;
- preserve fail-closed behavior.

Do not weaken the normalizer globally because one publisher changed markup.

## 6. Documentation can lag implementation

**Type:** PROCESS RISK

Some older repository documentation describes local persistence or earlier cutover steps because the project has
evolved from a local prototype into a Supabase-backed Production system.

For current behavior, use this precedence:

1. implementation + tests;
2. migrations/schema contracts;
3. `docs/PROJECT_CONTEXT.md`;
4. specialist runbooks/product docs;
5. historical chat/context.

If a doc is stale, update it while making the related code change instead of teaching Codex to ignore all docs.

## Maintenance rule

Whenever an item becomes fully resolved:

1. remove it from this file;
2. preserve the useful root cause/fix/lesson in `ENGINEERING_HISTORY.md` if future regressions would benefit from it;
3. update `PROJECT_CONTEXT.md` if the resolution changed current architecture or behavior.

Whenever a new issue is added, state whether it is **confirmed**, **suspected**, or **verification-only**. Avoid
recording guesses as facts.
