# Notification security review — 2026-09-06

This is the notification-focused evidence supplement to the repository assessment. `.agents/SEC-SKILL.md` was located, read in full, and followed before analysis or editing. Repository instructions, SECURITY.md, product/context/architecture/history/known-issues documents, environment examples, package scripts, workflows, and current notification migrations were inspected. The Supabase skill and current official function-security guidance were also used. No production mutation, provider delivery, or external hostile request was performed.

## Attack surface and trust model

| Entry point | Reachability and authority | Data flow / assets |
| --- | --- | --- |
| `GET /api/alerts/config` | Anonymous | Returns only enabled state and public VAPID key; no private key or subscription collection. Dynamic, private/no-store response. |
| `POST /api/alerts/subscribe` | Anonymous; exact configured Origin and same-origin Fetch Metadata required | Strict bounded JSON → server destination/key validation → `savePushSubscription` → local private file or signed namespace RPC. Returns only random subscription identifier. Non-browser clients can forge Origin/Fetch Metadata; those headers prevent browser CSRF, not automated abuse. |
| `PATCH /api/alerts/preferences` | Anonymous possession of random subscription identifier plus same-origin envelope | Bounded strict schema → canonical LGU preference update by UUID and namespace. Identifier acts as a bearer capability for the anonymous device. |
| `DELETE /api/alerts/preferences` | Same device capability boundary | Deactivates matching namespace subscription. No keys returned; unknown UUIDs do not reveal existence. |
| `POST /api/admin/notifications/preview` | Server-side admin session plus Origin, Fetch Metadata and session CSRF token | Validates input, returns count or explicitly unavailable preview; creates no event and reveals no subscriber records. |
| `POST /api/admin/notifications` | Same server-side admin mutation boundary | Strict bounded manual input → authoritative recipient selection → request-key-idempotent event/outbox → dispatch. Caller cannot specify arbitrary destination, URL, sender key, recipient UUID, SQL operation, or fingerprint. |
| `GET /api/admin/bootstrap` | Server-side admin session | Private bounded manual-history summaries, never public subscriber keys. |
| Collector/storage publication callbacks | Protected collector/admin publication path | Conservative publication checks → immutable event fingerprint → active LGU subscriptions → delivery rows. Push failure never changes published status. |
| Collector retry / admin dispatch | Internal after protected work | Private bounded pending batch → expiration/publication recheck → provider destination/key recheck → encrypted push → bounded error-code persistence. |
| Supabase notification RPC wrappers | Data API anon role, but every operation requires signed worker proof | Namespace-specific HMAC, timestamp and replay-nonce verification precede private storage function. Browser never receives signed RPC arguments or cron secret. |
| `SuspensionAlerts` browser UI | Public client | Browser Push API subscription → server; random subscription capability saved in localStorage. Dismiss preference is also localStorage. No admin token/VAPID private key is stored here. |
| Service worker | Public same-origin privileged browser component | Root assessment covers network-only caching and click-navigation boundaries. Notification text uses browser notification text fields, not HTML. |

Private persistence consists of endpoint URLs, subscription encryption parameters, device LGU preferences, notification events and deliveries. Local filenames derive only from server configuration and a fixed basename; files are created with mode 0600 and writes use a file lock plus temporary-file rename. Production persistence uses private/RLS-enabled tables with table grants revoked. SQL takes parameters; no caller-generated SQL or filesystem path is constructed.

Highest-value assets in this subsystem are truthful suspension notifications, the privileged ability to initiate broadcasts, private subscriber endpoints and keys, VAPID/worker secrets, and queue/database/worker availability. Attackers include anonymous scripts registering crafted subscriptions; adversaries waiting for ordinary collector publications to activate stored payloads; hostile preview-runtime principals trying to affect Production; and passive observers seeking public key/identifier leaks. A compromised permitted push provider remains a separate trusted-provider threat.

## Findings and remediation

### N1 — Anonymous stored push destination becomes an arbitrary server request

- **Severity:** High. **Confidence:** Confirmed. **CWE:** CWE-918; CWE-400.
- **Affected:** `src/lib/notifications/storage.ts`; `src/lib/notifications/dispatch.ts`; both persistence drivers and their public registration caller.
- **Vulnerable assumption:** A syntactically valid client-supplied URL must be a browser push-provider endpoint. Origin/Fetch Metadata were implicitly sufficient protection against direct scripts.
- **Prerequisites:** Anonymous access to registration, valid generated P-256/auth parameters, and a subsequent legitimate publication or administrator broadcast. VAPID configured for actual transmission.
- **Exact path:** Submit an arbitrary HTTPS destination with forged same-origin headers → route accepts/persists it → later ordinary notification creates delivery → dispatcher passes endpoint to `web-push` → installed library's `https.request` uses attacker-selected hostname, port and path. The old transport had no configured timeout and accumulated response data into a string.
- **Potential impact:** Blind outbound HTTPS requests to arbitrary external/private destinations; attacker-controlled slow or oversized responses can occupy the serial dispatcher or consume its memory. This can delay the collector/notifications. Internal exploitability depends on reachable HTTPS services and their behavior; no internal-service compromise or metadata disclosure was claimed. No response is exposed directly to the registrant. VAPID signing does not expose its private key.
- **Evidence / local verification:** Before the fix, the anonymous route returned **201** for `https://attacker.example/receive`; a simulated ordinary broadcast passed that endpoint to a mocked `web-push` sender. Both expected-security regression tests failed. Installed transport source was inspected to verify how that endpoint reaches `https.request`. No external network send occurred.
- **Fix:** `subscriptionValidation.ts` accepts canonical credential-free, fragment-free HTTPS URLs on dedicated Google, Mozilla, Apple and Windows push-provider domains, without alternate ports. It rejects control characters, parser-normalization differences, lookalike suffixes, arbitrary hosts and IP forms. It validates canonical 16-byte auth material and an actual uncompressed P-256 point. The shared storage function enforces this before either persistence driver, so internal callers cannot bypass the route; dispatch validates existing stored records before every sender, including injected transports, and marks invalid subscriptions terminal. The forward SQL migration independently validates the exact payload, provider URL, key lengths and canonical NCR LGU set. A 10-second socket inactivity timeout bounds the supported provider transport.
- **Regression:** `notificationAttackPaths.test.ts` covers original ingress/storage/legacy-delivery attacks, private/metadata/alternate-IP/IPv6/scheme/credential/host-confusion inputs, valid supported providers, malformed keys and the timeout. `notificationNamespaceSecurity.test.ts` proves the database rejects malformed/extra fields, bad endpoints/keys and non-canonical LGUs. Invalid stored destinations never reach the mocked sender after remediation.
- **Limits:** Dedicated provider namespaces remain trusted for DNS and protocol behavior. The installed `web-push` library does not follow redirects, so redirect-based arbitrary-host SSRF is not available through this transport. The socket timeout is not an absolute end-to-end deadline; the allowlist removes attacker-owned slow-response hosts from the normal threat model. Provider DNS/host behavior was not actively probed.

Provider scope follows current primary documentation: [Mozilla Autopush endpoints](https://mozilla-services.github.io/autopush-rs/http.html), [Apple Web Push egress domains](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), and [Microsoft channel URI validation](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview). The deployed library's Google FCM endpoint handling was also inspected.

### N2 — Other-namespace and inactive queue entries can starve valid deliveries

- **Severity:** Medium. **Confidence:** Confirmed. **CWE:** CWE-400; CWE-841.
- **Affected:** SQL `classstatus_private.notification_store`, operation `list-pending`; local `listPendingPushDeliveries`.
- **Vulnerable assumption:** Applying a global pending-row LIMIT before namespace/active-subscriber filtering is equivalent to limiting eligible deliveries.
- **Prerequisites:** Enough older pending/failed entries belonging to another namespace or deactivated subscriptions to fill the requested batch. Anonymous subscription growth plus subsequent normal publications/deactivation can contribute; a preview runtime can independently populate its own queue. End-to-end production timing was not tested.
- **Exact path:** Build older ineligible backlog → global query selects those rows up to 100 → later namespace/active join discards them → legitimate newer rows are never selected. Repeated sweeps see the same ineligible front of the queue.
- **Impact:** Notification suppression/availability loss across normal users; Preview backlog can interfere with Production despite separate data namespaces.
- **Evidence / local verification:** Executable PostgreSQL-compatible PGlite test created earlier Preview and later Production deliveries; Production `list-pending(limit=1)` incorrectly returned `[]` before remediation. An additional regression checks an older inactive subscription in the same namespace.
- **Fix:** CLI-generated forward migration `20260905161120_harden_notification_namespace.sql` filters namespace and active recipients before ordering/limiting the batch. Local storage now filters both event/subscription namespaces and active status before slicing. Public signed wrappers and their grants/proof/replay checks remain intact.
- **Regression:** `notificationNamespaceSecurity.test.ts`, eligible namespace and inactive-backlog tests. All pass using real SQL execution against the migrated local fixture.
- **Deployment requirement:** Apply the new forward migration through the owner's normal deployment process; repository tests cannot prove the live function has changed.

### N3 — Delivery updates omitted the namespace authorization predicate

- **Severity:** Low. **Confidence:** Confirmed primitive; exploitation prerequisites were not demonstrated in production. **CWE:** CWE-863.
- **Affected:** SQL notification store `record-delivery`; local `recordPushDelivery`.
- **Vulnerable assumption:** A delivery UUID alone is sufficient after any namespace's worker proof has passed.
- **Prerequisites:** Valid Preview worker capability/runtime compromise **and** knowledge of a Production delivery UUID. No public UUID enumeration/leak was found, and an anonymous route cannot ask the server to sign `record-delivery`.
- **Exact path:** Present a valid Preview worker operation naming a known Production delivery UUID → old update predicates matched only UUID → modify Production delivery status/attempt metadata.
- **Impact:** Suppress or manipulate the known notification delivery. This does not authorize suspension publication, grant admin access, or reveal subscription keys.
- **Evidence / local verification:** PGlite fixture selected Preview worker context and updated a known Production delivery; old SQL changed `pending` to `delivered`. Test failed before remediation and passes afterward. The test models the already-verified worker boundary, not a forged HMAC.
- **Fix:** Forward migration and local adapter require both related event and subscription to belong to the authorized namespace. SQL worker-context comparison also now rejects NULL namespace/context explicitly as defense in depth; the private function remains non-executable by public/anon/authenticated roles.
- **Regression:** Cross-namespace update denied, same-namespace completion permitted, absent context denied, and real function/table privilege checks in `notificationNamespaceSecurity.test.ts`.

### N4 — Automatic retries could announce an expired suspension

- **Severity:** Medium. **Confidence:** Confirmed stale-delivery behavior; malicious creation of a real production delay was not attempted. **CWE:** CWE-841.
- **Affected:** `src/lib/notifications/dispatch.ts`.
- **Vulnerable assumption:** A publication safe at enqueue time remains suitable for delivery indefinitely.
- **Prerequisites:** A legitimate queued automatic event survives an outage/backlog into the time after its suspension ends. An attacker exploiting queue/resource abuse can contribute to delay; normal provider failure is sufficient to expose the correctness defect.
- **Exact path:** Valid automatic event queued → retries delayed beyond Manila effective/end date or time → old dispatcher sends the saved “LGU is suspended” text without current lifecycle check.
- **Impact:** Trusted notification can materially mislead students about an already-ended suspension. The dashboard's independently checked public status does not repair the notification already displayed.
- **Evidence / local verification:** Test created a September 8 event, advanced the local clock to September 9 Manila midnight, and observed the old dispatcher call its sender. The regression failed before the fix.
- **Fix:** Immediately before dispatch, automatic events must still satisfy the existing publication/provenance predicate and current Asia/Manila lifecycle rules. Ineligible deliveries become terminal with a bounded non-sensitive error code. The legitimate browser subscription remains active. Manual messages and still-valid retry timestamps retain existing semantics.
- **Regression:** Added expiration regression in `notifications.test.ts`; all prior publication/retry/manual-message tests pass.
- **Limits:** This checks the stored automatic record's validity/expiry. It does not add a new authoritative lookup for a record subsequently revoked/superseded after enqueue; concurrent publication/removal freshness needs separate design beyond this small expiration fix. No remotely reachable revoke/supersede bypass was demonstrated here.

### N5 — Anonymous subscription registration permits persistent storage/fanout abuse

- **Severity:** Medium. **Confidence:** Confirmed. **CWE:** CWE-770 / CWE-400.
- **Status:** Residual; deployment/ownership-aware abuse control required.
- **Affected:** `POST /api/alerts/subscribe`, `savePushSubscription`, both notification event fanout operations, signed-worker nonce storage.
- **Vulnerable assumption:** A syntactically valid subscription on a real provider hostname represents a real browser registration. Origin/Fetch Metadata do not identify automated clients.
- **Prerequisites:** Anonymous route access. Attacker can generate valid P-256 keys and arbitrary unique paths under an allowed provider hostname without actually registering with that provider.
- **Exact path:** POST many different fake provider endpoints → each becomes a durable subscription with a returned device UUID → each later matching publication/manual broadcast creates another delivery row per active fake subscription. Invalid provider cleanup only deactivates subscriptions; accumulated rows remain. Supabase writes additionally require a signed-worker nonce.
- **Impact:** Persistent storage growth, database/worker cost and outbox amplification. Endpoint uniqueness deduplicates exact repeats but not attacker-generated distinct paths. No subscriber-data disclosure or notification-content privilege escalation is needed.
- **Evidence / local verification:** A bounded temporary local probe submitted **50** distinct fake provider endpoint paths with synthetic valid keys; **50/50 returned 201** and produced **50 subscription rows**. One simulated normal broadcast created **50 delivery rows**. No push provider was contacted. The temporary probe and local data were removed afterward.
- **Recommended remediation:** Owner-configured edge abuse control for `POST /api/alerts/subscribe` using the hosting platform's trusted client identity, chosen with school/shared-network users in mind; namespace-specific capacity/retention policy tied to actual deployment budget. Stronger future controls could require a browser push-delivery registration challenge or another deliberate ownership proof. These need product/deployment choices and should not be implemented as arbitrary global quotas or trusted caller-supplied IP headers. The SSRF/provider/key validation fix reduces input abuse but does not close cardinality abuse.
- **Regression expectation for follow-up:** Distinct fake registrations are bounded by the chosen trusted-identity policy, valid shared-network users remain usable, restart/parallel-instance behavior cannot bypass enforcement, and provider/worker failure does not cause unlimited state growth.

## Reviewed paths without a demonstrated vulnerability

- Direct anonymous admin send and preview are denied by the server mutation guard; hiding controls is not relied on. Existing session-CSRF/Origin checks and strict schemas remain authoritative.
- Manual preview storage-outage degradation creates no event and bypasses no authorization. The send/create operation remains separate and authoritative.
- Manual request keys deduplicate event/outbox creation; repeated text with a new authorized key is intentionally possible. No public notification-history/list-subscriber route exists.
- Worker HMAC payload includes namespace, action, timestamp, nonce and payload digest; the public subscription route cannot return proofs or mass-assign another storage operation. Reusing the existing signed `logs.append` action is a domain-separation hardening opportunity, not a demonstrated public signature-forgery path.
- Notification data tables have RLS and revoked browser grants. The tests check actual local privileges, not only SQL text. Full live Supabase grants/RPC definitions and Vault parity still require deployment evidence.
- Anonymous subscription UUIDs act as device bearer capabilities and are not publicly enumerated. This review found no route leaking another device's UUID; guessing a random UUID is not a feasible IDOR attack. Endpoint takeover based on a stolen endpoint/capability is a credential-compromise scenario, not anonymous enumeration.
- Subscription/public configuration responses contain neither VAPID private key nor other subscribers' encryption keys. Notification error persistence records bounded generic codes rather than raw endpoint URLs/provider response bodies or stack traces.
- React-rendered manual messages are escaped; browser notification fields are plain text. Server-generated notification destinations are relative homepage/LGU paths; attacker source text does not become an executable notification URL.
- No SQL string concatenation, shell invocation, caller-supplied filesystem path or remotely selectable storage filename occurs on the notification paths.
- Public routes expose only their declared methods; the root production-build smoke covers framework 405 responses and malformed/oversized streaming input handling shared with the admin request helper.

## Verification and deployment limits

Final notification-focused run at handoff: **6 test files passed, 73 tests passed, 0 failed**:

`npx vitest run tests/notifications.test.ts tests/notificationAttackPaths.test.ts tests/notificationNamespaceSecurity.test.ts tests/manualNotifications.test.ts tests/adminNotificationPreviewRoute.test.ts tests/notificationSecurityContracts.test.ts`

The full local repository gates passed: TypeScript, lint with 47 warnings and no errors, **487/487** tests, production build, `npm audit` with zero reported vulnerabilities, clean `git diff --check`, and **74/74** isolated production HTTP smoke checks. Baseline exploit regression failures were **2 SSRF tests**, **2 SQL authorization/queue tests**, and **1 stale-delivery test**; each was re-run successfully after its fix. The separate bounded cardinality probe passed its **1 measurement test** and was deliberately not retained as an assertion requiring insecure behavior.

No live Supabase grants, Vault values, migrations, browser push-provider delivery, VAPID configuration or hosting edge abuse rules were inspected or changed. Apply/verify the new migration and configure trusted registration abuse controls before claiming those paths are closed in Production. Deploying the code fixes is recommended as a security improvement; notification infrastructure should not be described as fully hardened while N5 is unresolved. All changes remain in the working tree for review.
