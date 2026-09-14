# Class Status — Final Product Context / AI Handoff

Updated: 2026-09-06 (Asia/Manila)

## START HERE — FOR A NEW CHATGPT / CODEX ACCOUNT

You are continuing an existing project called **Class Status**. Do not restart the project, replace the architecture, or redesign working areas unless explicitly asked.

Treat this document as the current high-level source of truth. Before changing code, inspect the repository itself and read the repository documentation, especially:

- `README.md`
- `AGENTS.md` if present
- `PROJECT_STATUS.md` if present
- `TASKS.md` if present
- `docs/ARCHITECTURE.md`
- `docs/KNOWN_ISSUES.md`
- `SECURITY.md`
- `.agents/SEC-SKILL.md` for security work if present

The project has already completed its main v1 development, security hardening, Supabase migrations, and Production deployment.

---

# 1. PRODUCT IDENTITY

**Name:** Class Status

**Purpose:** A near-live, evidence-backed class suspension information platform for Metro Manila / NCR students and parents.

The core question the product answers is:

> “May pasok ba?”

The product should make it fast to see whether classes are suspended in a specific NCR LGU while avoiding false claims when evidence is stale, incomplete, conflicting, or ambiguous.

Class Status is an actual deployed Production project, not a prototype.

---

# 2. CURRENT PROJECT STATUS

As of 2026-09-14:

- Main v1 product development: COMPLETE
- Production audit: COMPLETE
- Performance pass: COMPLETE
- PWA/install experience: COMPLETE
- Web Push notifications: COMPLETE
- Admin notification tools: COMPLETE
- Open-source repository preparation: COMPLETE
- Security audit: COMPLETE
- Security fixes: COMPLETE
- Supabase security migrations through `20260914090000`: LIVE IN PRODUCTION
- Push-registration application code: LIVE IN PRODUCTION
- Migration history alignment: COMPLETE
- App-side security patch: committed to `main` and deployed to Vercel Production
- Production deployment: SUCCESSFUL on Vercel (`dpl_7RTKKQfYvFiV4Qo12Wkdmrj3zSy8`)

Latest relevant commits:

- `4506ce6` — `chore: align Supabase migration history`
- `8b72f00` — `security: harden admin sessions and notifications`
- Earlier major release commit: `1327860` — `feat: add PWA install experience`

The security work was developed on branch:

- `security/astra-audit`

Keep that branch and the security backup stash temporarily until the Production deployment has been stable for a while.

---

# 3. MAIN TECHNOLOGY STACK

Current application stack:

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Lucide icons
- Supabase / PostgreSQL for durable hosted state
- local JSON/storage fallback where designed
- Node/TypeScript collector
- Cheerio for parsing
- Vitest
- ESLint 9 flat config
- Web Push / Push API / Notifications API
- PWA service worker
- Vercel deployment

Package/runtime direction:

- Node 22.x
- npm
- strict TypeScript

Do not replace major libraries simply for novelty.

---

# 4. GEOGRAPHIC SCOPE

Class Status is NCR-only.

It supports all **17 Metro Manila LGUs**:

1. Caloocan
2. Las Piñas
3. Makati
4. Malabon
5. Mandaluyong
6. Manila
7. Marikina
8. Muntinlupa
9. Navotas
10. Parañaque
11. Pasay
12. Pasig
13. Pateros
14. Quezon City
15. San Juan
16. Taguig
17. Valenzuela

Geographic data was based on PSA / GeoRiskPH municipal boundaries and checked against PSGC expectations.

Important map details:

- SVG-based NCR map
- Manila geometry dissolved correctly
- Caloocan handled as MultiPolygon
- 17 LGUs visible on initial map experience
- zoom / pan / reset behavior preserved
- simple click/tap must not be mistaken for drag
- labels remain sharp through native SVG transforms

---

# 5. CORE PUBLIC EXPERIENCE

The application is mobile-first and map-first.

Important public UX includes:

- interactive NCR map
- LGU selection
- quick search
- class suspension status
- evidence/source information
- school finder
- About page
- Sources page
- install/PWA guidance
- notification bell in navbar
- responsive desktop/mobile behavior

The interface must remain careful with wording.

Never state that classes are definitely ongoing merely because no suspension is currently verified.

Prefer conservative wording when evidence is missing or uncertain.

---

# 6. ROUTES / PUBLIC SURFACES

Important routes include:

- `/`
- `/sources`
- `/about`
- `/install`
- `/collector`
- `/collector/login`

Important APIs include or have included:

- `/api/lgus`
- `/api/suspensions`
- `/api/schools`
- `/api/demo-mode`
- `/api/share/ncr`

The exact repository is authoritative if routes have evolved.

---

# 7. DATA / PUBLICATION SAFETY MODEL

Class Status is intentionally conservative.

A suspension should not be published merely because some text vaguely appears to mention cancellations.

The collector / normalizer expects sufficient information such as:

- LGU
- effective date
- affected levels
- sector
- action
- provenance/source

Important safety behavior:

- stale records are held
- ambiguous records are held
- conflicting records are held
- malformed records are held
- unprovenanced records are held
- unknown schools/scopes fail closed
- restricted wording must not accidentally broaden into an LGU-wide suspension
- corrections/removals update the final published state
- same-day history snapshots can be replaced by corrected data

The system prioritizes avoiding a false public suspension over maximizing automatic publication.

---

# 8. COLLECTOR MODEL

Only **Tier 3** is operational.

Tier 1 and Tier 2 remain intentionally disabled.

Sources have included public media/source feeds such as:

- GMA
- Inquirer
- Rappler

Source parsing and collector behavior should remain fail-closed.

Freshness handling:

- durable `lastSuccessfulCheckAt`
- only a fully successful Tier 3 check updates that timestamp
- failed or partial attempts must not falsely refresh it

Per-source health includes concepts such as:

- Healthy
- Partial
- Delayed
- Unknown

The system distinguishes latest attempt from last success.

---

# 9. PUBLISHED HISTORY

Published status history exists per:

- LGU
- effective date

Behavior:

- latest same-day snapshot replaces prior state
- corrections/removals update the final history entry
- local storage and Supabase-backed durable state are supported as designed

---

# 10. PUSH NOTIFICATIONS

Class Status supports browser/PWA push notifications.

Implemented behavior includes:

- Push API
- Notifications API
- service worker
- VAPID
- anonymous subscription storage
- dedupe by fingerprint
- retries/backoff
- invalid subscription cleanup
- safe created/updated automatic events only
- bounded, idempotent anonymous registration with shared Supabase rate-limit state (database and application live)

Automatic notification copy is designed around concise factual suspension updates.

Manual admin broadcasts use the exact admin message body.

Notification targeting supports:

- all subscribers
- selected LGUs

Admin notification history is durable.

---

# 11. PWA / INSTALL EXPERIENCE

The application is installable as a PWA.

Behavior includes:

- manifest
- service worker
- standalone/install behavior
- install popup
- mobile bottom-sheet style install prompt
- desktop modal
- suppression when already installed
- dismissal cooldown
- `/install` guide

Critical caching rule:

**Dynamic class status information must remain network-fresh.**

Do not cache API/auth/admin/collector traffic in a way that can show stale or private state.

The service worker was hardened so API/auth/admin/collector paths are network-only.

---

# 12. ADMIN / COLLECTOR SECURITY MODEL

The `/collector` area is protected.

Security work specifically hardened:

- Supabase Auth session validation
- admin guard/session recreation
- revoked/expired/replaced JWT handling
- competing login serialization
- logout revocation
- request body streaming/caps
- malformed UTF-8/JSON rejection
- internal error leakage
- CSRF/origin/request validation
- notification subscription validation
- notification namespace isolation
- queue starvation protection
- delivery namespace ownership
- service worker navigation safety
- collector fail-closed behavior
- external response cancellation/size handling
- GitHub Actions SHA pinning

Do not weaken these controls during future work.

---

# 13. SECURITY AUDIT — FINAL STATUS

A dedicated security audit was completed.

Confirmed/fixed issues included:

- revoked Supabase JWT could recreate admin guard
- request bodies could be buffered too far before limit enforcement
- admin internal errors could leak
- arbitrary stored push endpoint could reach `web-push`
- foreign/inactive notification rows could starve a namespace queue
- delivery updates lacked sufficient namespace predicates
- delayed retry could send an expired suspension notification
- unknown-school/restricted wording could broaden a notice
- discarded media responses could retain resources
- protocol-relative notification destinations could leave origin

No confirmed:

- VAPID private-key leak
- anonymous admin mutation bypass
- SQL injection
- service-worker caching of private/API data

Residual/operational risks documented for future consideration include:

- distributed push-registration abuse beyond a single platform client identity
- legacy malformed subscriptions are handled when encountered rather than fully pre-cleaned
- queued notification state is not always fully re-resolved against every later authoritative mutation
- external source/provider infrastructure remains a dependency

See repository `docs/KNOWN_ISSUES.md` for current details.

---

# 14. SUPABASE PRODUCTION

Production Supabase project:

- Project name: `ClassStatus`
- Project ref: `fyupnqsdfkqfrjcypues`
- Region: `ap-southeast-1`

Important final security migrations:

- `20260905161059_prevent_admin_session_reactivation.sql`
- `20260905161120_harden_notification_namespace.sql`

Both were verified as applied in Production through Supabase CLI migration history and read-only schema inspection on 2026-09-14.

The live admin session hardening checks the actual Supabase Auth session and expiry at the DB boundary.

The live notification store validates:

- provider endpoint
- endpoint length
- p256dh key shape
- auth key shape
- canonical LGU list
- deployment namespace
- active subscription state

It also applies namespace isolation to:

- preference updates
- deactivation
- event creation
- pending queue listing
- delivery recording

Private notification storage execution remains restricted.

Migration `20260914090000_rate_limit_push_registration.sql` adds private, expiring, namespace-scoped counters for
anonymous registration. It was applied to and verified in Production on 2026-09-14 before the matching route code,
which was then deployed and verified live on the same date.

---

# 15. SUPABASE MIGRATION HISTORY

Migration-history drift was corrected without falsely marking real Production migrations as reverted.

Historical local migration filenames were aligned with actual Production versions.

Important aligned historical versions include:

- `20260830141958_add_live_admin_operations.sql`
- `20260830150633_fix_active_presence_heartbeat.sql`
- `20260830154124_remove_live_operations.sql`
- `20260904231814_allow_manual_notification_family_fingerprints.sql`

The `20260904231814` migration contains the real Production SQL for allowing both automatic and manual family fingerprints.

Final Supabase CLI dry-run reported:

> Remote database is up to date.

After applying `20260914090000_rate_limit_push_registration.sql` on 2026-09-14, a fresh Supabase CLI dry run again
reported that the remote database is up to date.

Do not casually rename or repair these migration versions.

---

# 16. SECURITY ADVISOR NOTES

Supabase security advisors still surface some warnings/info that are not automatically vulnerabilities.

Examples:

- RLS enabled with no policy on internal tables
- SECURITY DEFINER functions callable by roles that are intentionally routed through guarded wrappers
- leaked-password protection disabled

Interpret these in context before modifying permissions.

Do not blindly “fix” advisor warnings if doing so would break the intentional guarded RPC architecture.

Leaked password protection can be enabled separately as an Auth hardening improvement.

---

# 17. VALIDATION STATUS

Security/audit validation included:

- focused auth/request tests
- notification tests
- full Vitest suite
- TypeScript checks
- ESLint
- Production build
- npm audit
- diff checks
- local HTTP smoke tests
- migration regression tests

Latest lint result during final deployment:

- 0 errors
- 47 non-blocking warnings

Those warnings are mostly unused imports/variables and are not security blockers.

Before Production push, tests and build were run successfully.

---

# 18. PRODUCTION DEPLOYMENT

Repository:

- `cnlycruz/ClassStatus`

Main branch contains the final security patch and migration alignment.

Production hosting:

- Vercel

The final Vercel status for the latest `main` deployment was verified as:

- SUCCESS

Therefore:

**Class Status v1 is finished and deployed.**

Future work is maintenance/enhancement, not completion of the original v1.

---

# 19. OPEN-SOURCE / REPOSITORY PREPARATION

Repository has been prepared for public/open-source work.

Files added during open-source preparation include concepts such as:

- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/ARCHITECTURE.md`
- issue templates

Current license history includes MIT.

Past released MIT versions remain MIT.

Any future licensing changes must preserve applicable third-party notices and already-granted rights.

---

# 20. IMPORTANT UX / IMPLEMENTATION DETAILS ALREADY FIXED

Do not accidentally regress these:

- navbar logos no longer receive an extra rounded clipping mask
- light/dark branding switches without layout shift
- map click/tap works on Windows without drag capture stealing clicks
- desktop map sizing has a tall/portrait-friendly presentation
- theme switching was performance-optimized
- excessive route prefetching was reduced
- oversized logo assets were replaced
- PWA install prompt has cooldown/suppression logic
- notification popup is centered and mobile-scroll-safe
- homepage notification card was removed in favor of navbar bell
- mayor data for all 17 NCR LGUs was refreshed from DILG-NCR references

---

# 21. PROJECT DEVELOPMENT PRINCIPLES

When continuing the project:

1. Inspect the current repository before editing.
2. Preserve working architecture.
3. Avoid unnecessary rewrites.
4. Prefer surgical changes.
5. Protect conservative publication behavior.
6. Treat class-status freshness as safety-critical.
7. Preserve mobile-first UX.
8. Preserve map accuracy and all 17 LGUs.
9. Preserve security controls.
10. Run relevant tests/build after meaningful changes.
11. Do not expose secrets.
12. Do not treat an empty/no-evidence state as proof that classes are ongoing.

---

# 22. USER / WORKFLOW PREFERENCES FOR THIS PROJECT

For development assistance:

- Prefer doing setup/testing/deployment automatically when tooling permits.
- Avoid asking the user to perform unnecessary manual steps.
- When manual commands are required, give exact copy-paste Windows CMD commands.
- Keep explanations direct and practical.
- Avoid changing working UI or architecture without a reason.
- For security work, use the existing security skill/instructions and distinguish confirmed issues from theoretical risks.

---

# 23. WHAT TO DO IN A NEW ACCOUNT

Upload this file to the new ChatGPT account and say:

> This is the current product context for my Class Status project. Read it fully and use it as the starting context. The project is already finished and deployed. Do not restart the architecture or assume old unfinished tasks are still pending. When coding, inspect the actual repository before making changes.

For coding work, also give the new account access to the GitHub repository or clone.

The repository itself remains the ultimate technical source of truth because code can change after this handoff was generated.

---

# 24. FINAL ONE-LINE STATE

**Class Status is a completed, security-audited, Supabase-backed, PWA-enabled NCR class suspension platform with all 17 LGUs, deployed successfully to Production on Vercel as of 2026-09-06.**
