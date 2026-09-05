# Architecture

This document provides a public-safe overview of ClassStatus. No live project identifiers, administrator identities, private endpoints, credentials, or deployment-specific values belong here.

## System overview

ClassStatus is a Next.js 15 App Router application using React 19 and TypeScript. Its main parts are:

- **Public web application:** the map-first dashboard, list view, LGU detail panels, school search, source pages, share output, themes, and alert controls.
- **Collector pipeline:** approved source adapters fetch and parse notices, normalize explicit facts, validate evidence, and pass eligible records through conflict and publication safeguards.
- **Storage boundary:** local development can use generated JSON files; hosted environments use Supabase/Postgres through server-side adapters and narrowly scoped RPCs.
- **Notifications:** subscription and delivery logic is server-side. The browser receives only the public Web Push key and projected public data.

The public application reads a deliberately limited projection of current suspension data. Private collector, audit, administrative, and proof material must not be returned by public routes.

## Data and trust flow

```text
approved source -> fetch/parse -> normalize -> validate/conflict checks
                -> storage/publication boundary -> public projection -> dashboard
```

ClassStatus does not infer a suspension from weather, social discussion, or incomplete reporting. Ambiguous, stale, conflicting, malformed, or unprovenanced notices remain uncertain or fail closed. Dates and freshness use `Asia/Manila` semantics.

The public model contains exactly 17 logical NCR LGUs. Caloocan has two map polygons but one status identity. Geometry provenance and transformation details are recorded in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Browser architecture

The homepage hydrates the interactive controls and regularly refreshes public data without rendering unchanged results. Refresh is visibility-aware and single-flight. Map pan and zoom use native SVG transforms on the map-content `<g>` element, scheduled with `requestAnimationFrame`, to keep boundaries sharp across desktop and touch browsers.

The service worker caches only appropriate static/navigation assets. `/api/`, `/collector/`, and `/auth/` remain network-only so private or mutable responses are not persisted by the PWA cache.

## Environments and configuration

Local development defaults to the `local-json` storage adapter and writes generated state beneath `CLASSSTATUS_DATA_DIR`. Hosted deployments select the Supabase adapter and provide server-only configuration through their environment manager. Web Push and local administrator access are optional configuration groups.

See [.env.example](../.env.example) for variable names and safe placeholders. Never place real values in repository files, issues, fixtures, or screenshots. Deployment-specific configuration belongs in the hosting and database providers, not in this repository.

Database and authorization contracts evolve through forward migrations in `supabase/migrations`. For operational work, the current migrations and implementation are authoritative; public documentation intentionally omits deploy-time identifiers and procedures.

## Important boundaries

- Browser bundles must not receive server-only credentials or storage clients intended for privileged operations.
- Hosted runtime code must preserve the existing least-privilege RPC and namespace boundaries.
- Collector execution must preserve leases, proof checks, provenance, conflict handling, and publication safeguards.
- Authentication, CSRF/origin checks, request limits, and Web Push recipient isolation are security boundaries, not optional application conveniences.

For product behavior and accessibility requirements, see [PRODUCT.md](../PRODUCT.md). For current engineering state and historical constraints, see [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) and [ENGINEERING_HISTORY.md](ENGINEERING_HISTORY.md).
