# Authentication, authorization, and storage security review

Assessment date: 2026-09-06 (Asia/Manila). This is a scoped technical appendix to the repository security assessment, not a claim that Production was tested.

## Instructions and method

Located and read **the entire `.agents/SEC-SKILL.md`** before analysis or edits, and followed its trust-boundary, fail-closed, least-privilege, safe-verification, and reporting guidance. Also read AGENTS.md, SECURITY.md, PRODUCT.md, PROJECT_CONTEXT, ARCHITECTURE, ENGINEERING_HISTORY, KNOWN_ISSUES, `.env.example`, package scripts, and the CI workflow. The Supabase skill and current official session/sign-out documentation were used for the database fix. No live database, external source, deployment, or real account was security-tested; no secrets were printed, credentials rotated, or Git operations published.

The attack map below was developed before testing. Review followed actual routes into session enforcement, storage adapters, effective migration definitions and privileges, rather than relying on protected UI or middleware. Hostile requests use local streams, mocked storage, and isolated PGlite/PostgreSQL with synthetic Auth fixtures.

## Scoped attack map

| Entry point | Reachability and authority | Storage/network boundary |
| --- | --- | --- |
| `/collector`, `/collector/login` | Server pages check `getAdminSession`; login is public. Middleware only refreshes Auth and is not authorization. | Local session digest or Supabase verified user plus guarded session RPC. |
| `GET /api/admin/auth/login-challenge` | Anonymous; signed, expiring challenge, no state write. | HMAC uses server pepper. |
| `POST /api/admin/auth/login` | Anonymous; exact configured Origin, same-origin Fetch Metadata, JSON/schema/body budget, challenge, credentials. | Local Argon2/password hash + private throttle, or Supabase password authentication and immutable admin UUID; issue guarded session, audit. |
| `POST /api/admin/auth/logout` | Admin session, exact Origin, Fetch Metadata and session CSRF. | Revoke guard/session; Supabase global sign-out. |
| `/auth/reset-password`, `POST /api/auth/reset-password/authorize` | Page is public; authorization requires bearer token verified through Supabase and configured admin UUID, same-origin request. | Recovery client keeps tokens in memory and clears URL parameters; provider handles password write. URL and **publishable** key intentionally reach this page; private keys/pepper do not. |
| `GET /api/admin/bootstrap`, `/api/admin/audit`, `/api/admin/live/logs` | Server admin check before data access. | Namespace-fixed authenticated RPCs; raw collector/audit data never exposed anonymously. SSE queries repeat DB session authorization. Bootstrap reconciles only already-due removal deadlines. |
| `POST /api/admin/suspensions/preview`, `/api/admin/suspensions`, `/api/admin/suspensions/[id]/remove`, `/api/admin/suspensions/[id]/undo` | Session + Origin + Fetch Metadata + CSRF, bounded JSON, server schema/registry validation. | HMAC confirmation binds normalized payload/session, receipt expiry and consumption, idempotency and revision checks, namespace-fixed RPC. |
| `GET /api/collector/logs`, `/api/collector/sources`; `POST /api/collector/run` | Protected route handlers; run uses mutation envelope and execution lease. | Authenticated namespace RPC and approved source collector. Source `PUT` and legacy demo `POST` remain disabled (405). |
| `GET/POST /api/cron/collector` | Strong configured bearer secret compared through fixed-size SHA256/timing-safe equality. GET is static readiness; POST is leased collection. | Namespace/action/payload/time/nonce bound HMAC worker capabilities; Vault key independently checked by DB; replay receipts are private. |
| Public reads, alert endpoints | Anonymous public projections; alerts use shared JSON reader. Notification review covers their own identity/write controls. | Cookie-free public Supabase client invokes only narrow public or signed worker RPCs. |
| Direct Supabase Data API | Publishable key is public information, not an authorization secret. Authenticated wrappers must independently enforce principal/session; anonymous worker wrappers require signed proof. | Tables use RLS and revoked public privileges; private schema functions are not granted to API roles. Legacy service-role rollback overloads remain privileged and runtime does not depend on them. |

Filesystem paths derive from trusted `CLASSSTATUS_DATA_DIR` and fixed filenames, never a route ID. Local writes use exclusive temporary files, restrictive mode and atomic rename/locks. Vercel rejects local JSON fallback. Hosted namespace derives from platform environment, not request parameters. SQL calls use named typed arguments; the limited dynamic SQL formats schema-owned identifiers, not HTTP input.

## Confirmed findings and remediation

### A1. A revoked administrator JWT could restart its database session guard

- **Severity:** Medium. **Confidence:** Confirmed. **CWE:** CWE-613 (Insufficient Session Expiration).
- **Affected boundary:** `classstatus_private.start_admin_session` in `20260823065312_classstatus_durable_state.sql`, exposed to authenticated Production callers again by `20260825203903_add_production_runtime_security_support.sql`; equivalent Preview wrappers.
- **Vulnerable assumption:** JWT signature/principal/session ID was treated as sufficient to create a new guard. Starting unconditionally overwrote timestamps and cleared revocation; neither start nor ordinary principal checks confirmed `auth.sessions` still existed.
- **Prerequisite:** Possession of an already-issued, unexpired administrator access JWT. No anonymous credential theft or account takeover was demonstrated.
- **Exact path:** legitimate start → logout/revoke → Supabase removes Auth session → old JWT calls public `start_admin_session` RPC with attacker-selected well-formed digests → guard becomes active → direct protected RPCs are authorized again. A still-existing idle/absolute-expired session could likewise reset its guard, and a replaced session could replace the newer one.
- **Impact:** Bypass of logout, idle/absolute lifetime and single-session containment; resumed private reads and administrator mutations until bearer expiry (or longer if a surviving refresh credential exists).
- **Evidence/local verification:** `tests/adminSessionMigration.test.ts` executes the historical functions and current authenticated grant. After revocation/deleting the synthetic Auth session, touch fails, old start succeeds, then touch succeeds. This is a real local PostgreSQL function path; hosted JWT transport/signature validation is represented by synthetic request claims, not attacked.
- **Fix:** Forward migration `20260905161059_prevent_admin_session_reactivation.sql` verifies live, matching, unexpired `auth.sessions`; makes a same-login start an idempotent read that cannot change CSRF or expiry; rejects revoked/expired/replaced sessions; allows freshly authenticated replacements. Logout now attempts guard revocation and provider-global sign-out independently, checks both results, and fails closed only if neither boundary was successfully revoked. Private-function revokes and explicit empty `search_path` remain. No service-role runtime secret, schema rewrite, or Auth-table write was introduced.
- **Regression:** 8 database tests cover the historical proof, post-fix logout, Preview/Production retries, CSRF replacement, 30-minute idle/eight-hour absolute expiry, fresh replacement versus old session, a competing-start race, wrong-owner/missing/expired Auth session, disabled principal and ACLs. Six application-boundary tests verify that either independent logout control is sufficient and that failure of both is surfaced rather than reported as success.
- **Deployment requirement:** Apply/review the forward migration in the intended database. Repository tests cannot prove it is deployed or that the live schema/grants equal Git.

### A2. JSON size checks occurred only after consuming the entire request

- **Severity:** Medium. **Confidence:** Confirmed. **CWE:** CWE-400 / CWE-770.
- **Affected boundary:** `src/lib/admin/requestSecurity.ts:readBoundedJson`, reachable anonymously from login and public alert writers, as well as authenticated mutations.
- **Vulnerable assumption:** A `Content-Length` precheck and a byte check after `request.text()` bounded memory. A caller can omit the header and stream arbitrary content.
- **Prerequisite/path:** Anonymous client supplies expected origin metadata (not authentication for non-browser callers) and a chunked oversized request. `request.text()` consumed and buffered its entire body before the size rejection.
- **Impact:** Avoidable memory/allocation and request-duration cost. Hosting ingress caps may constrain the impact but were not assumed or bypass-tested.
- **Evidence/local verification:** A bounded synthetic 100-chunk stream proved the old helper consumed all 100 chunks even though its 64-byte budget was exceeded at chunk 3. No destructive load test was performed.
- **Fix:** Read bytes incrementally, reject/cancel at the first over-budget chunk, decode strict UTF-8 incrementally and return controlled errors. Limits themselves are unchanged. Invalid byte encodings now fail validation instead of silently becoming replacement characters.
- **Regression:** `tests/requestBodySecurity.test.ts` checks early cancellation, byte accounting across split UTF-8, exact limits, malformed JSON and malformed UTF-8. Shared existing route/lifecycle tests remain green. This does not claim to prevent every slow-connection or hosting-layer denial of service.

### A3. Suspension mutation routes returned arbitrary internal exception messages

- **Severity:** Low. **Confidence:** Confirmed error-flow disclosure; conditional runtime trigger. **CWE:** CWE-209.
- **Affected routes:** The four suspension preview/publish/remove/undo POST routes.
- **Vulnerable assumption:** Every `Error.message` after entering a domain operation was safe, deliberate validation text.
- **Prerequisite/path:** Authenticated administrator calls a mutation while an underlying storage/transport operation throws a filesystem or infrastructure error. Route catch returned that exact message. No unauthenticated disclosure was demonstrated.
- **Impact:** Internal paths/response details can enter browser responses; missing no-store on two error paths also violated the intended sensitive-response contract. No real secret exposure was observed.
- **Evidence/local verification:** Route fixtures inject a clearly synthetic private filesystem/transport failure. Before remediation the catch directly reflected arbitrary messages; post-fix all four return controlled 500/`INTERNAL_ERROR` and `no-store, private`.
- **Fix:** `src/lib/admin/suspensionErrors.ts` permits explicit domain codes only, maps authentication/storage failures safely and delegates unknown errors to generic handling. Unknown exceptions remain in server-side logs for diagnosis but never enter the client response. Known validation/conflict/not-found responses are retained with consistent 422/409/404 status; storage outages are 503, unexpected failures 500.
- **Regression:** `tests/adminSuspensionErrors.test.ts` contains 10 route tests covering four generic errors and six intentional domain/auth/storage outcomes.

## Disproved paths and remaining limits

- Hiding a button or the collector-page redirect is not the authority. Reviewed protected handlers enforce server auth before reading/mutating; hosted RPCs independently check immutable principal and session guard. Authenticated non-admin UUIDs are rejected before application RPC calls and again by database principal checks.
- Local authentication uses Argon2 and fixed-length hashed username comparison, random bearer tokens stored as HMAC digests, HttpOnly/Secure (production)/SameSite Strict host cookie, credential-version invalidation, one active session, eight-hour absolute and 30-minute idle expiry. Hosted cookies use HttpOnly/Secure/Strict; browser storage does not carry dashboard admin tokens.
- Mutation CSRF requires exact configured Origin, same-origin Fetch Metadata and session HMAC CSRF. Challenge expiry and generic login errors are present. Direct bearer-authenticated database RPC does not rely on browser CSRF. There is no wildcard CORS added.
- IDs select in-memory records/typed SQL parameters, not paths or interpolated SQL. Manual scope validation resolves known LGUs/schools, dates in the Manila live window, levels/sectors and HTTPS/HTTP evidence URLs without credentials; React renders text. Unknown draft properties are stripped rather than mass-assigned into persisted records. Confirmation signatures bind normalized payload and current session; SQL receipts are single-use and namespaced, lifecycle checks revision/idempotency.
- Worker proofs cover namespace, action, exact payload hash, issued-at and nonce; signature checked before nonce writes or parsing, with 90-second past/30-second future bounds and a five-minute nonce store. Public source/freshness projections exclude collector internals. The nonce and notification action design is covered by the other scoped review.
- **Identity isolation limitation (informational):** Current migrations intentionally allow the same configured Supabase admin UUID to hold both namespace principals. Such an authorized account's bearer token can start either namespace; different app peppers do not create separate Supabase identities. For isolation from a compromised Preview deployment where that admin signs in, use separate Auth projects/principals or separately designed namespace authorization. This assessment did not silently redesign that established trust relationship or claim namespace-fixed SQL solves identity sharing.
- **Owner-only evidence:** Confirm deployed migration parity/ACLs, live Auth session columns/read permissions, correct enabled principal(s), no leaked or mis-scoped runtime credentials, short appropriate provider JWT lifetime, and successful real sign-in/logout/re-login after migration. Supabase provider rate limits and edge abuse controls are deployment settings; local testing cannot establish their effective behavior. Real recovery/email/provider behavior was not exercised.

## Scoped verification

- `tests/adminSessionMigration.test.ts`: **8 passed, 0 failed** after remediation, including historical vulnerable behavior proof and competing-start serialization.
- `tests/adminSuspensionErrors.test.ts`: **10 passed, 0 failed**.
- `tests/requestBodySecurity.test.ts`: **3 passed, 0 failed**; historical test run had **2 expected failures / 1 pass**, proving full consumption and permissive UTF-8 decoding before the fix.
- Existing targeted checks: admin routes **5/5**, Supabase auth boundaries **6/6**, admin validation **7/7**, admin lifecycle **7/7** passed. Final repository gates were TypeScript pass, lint pass with 47 warnings and no errors, **487/487** tests, production build pass, `npm audit` with zero reported vulnerabilities, clean `git diff --check`, and **74/74** isolated production HTTP smoke checks. These are local results and do not establish Production deployment state.

Official session behavior references: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [Supabase sign-out](https://supabase.com/docs/guides/auth/signout). The changelog was checked; relevant recent Auth schema restrictions prohibit adding objects to Auth, which this fix does not do.
