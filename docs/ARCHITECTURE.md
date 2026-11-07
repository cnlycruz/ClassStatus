# ClassStatus local architecture

Current architecture: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Node.js 22 and JSON files.

```text
GMA / Rappler approved sources
    -> local Node.js collector (manual invocation)
    -> fetch and parse
    -> evidence/scope validation and conflict safeguards
    -> local JSON persistence
    -> protected Next.js API routes
    -> NCR dashboard, status history and school finder
```

- Site and local admin API run at localhost:3000.
- Files are saved under `CLASSSTATUS_DATA_DIR`, including collector logs, local notifications, audit and status history.
- Admin login uses locally configured Argon2 credentials, a private cookie, CSRF validation, bounded request handling, and local session storage.
- Push notification subscriptions/delivery records are local-only, with optional VAPID configuration.
- No external database, hosted cron, or platform SDK is required for local development.
- Only operational media sources are polled; other official-source adapters remain disabled until properly implemented.

**The local build is not an Internet-facing production system.** The collector is intentionally conservative: absent announcements are not proof that classes continue. Preserve evidence, freshness and uncertainty.

Historical deployment architecture is preserved in the repository's Git history and older engineering notes.
