# ClassStatus — Local Development Guide

ClassStatus NCR answers “May pasok ba?” for students across 17 Metro Manila LGUs.

## Active baseline

- Local-only Next.js 15, React 19, TypeScript, Tailwind CSS.
- Node 22, npm 10; file-backed JSON persistence.
- Optional protected local admin console.
- GMA and Rappler collector sources only; start manually via `npm run collect`.
- No hosted database, hosted scheduler or deployment-provider dependencies.

## Rules

- Maintain exactly 17 logical LGUs, with Caloocan's separated map polygons sharing one logical status.
- Never invent a suspension, infer from weather alone, or mistake missing evidence for classes continuing.
- Preserve provenance, conservative parsing, freshness tracking and failure visibility.
- Keep admin login, CSRF/origin checks, request limits, local session protections and notification validation.
- Keep all credentials and local data outside Git.
- Do not deploy or modify external services during local product improvement.
- Preserve UI branding, responsiveness, and accessibility unless the owner specifically requests changes.
- Keep hosted historical notes as context, not as the current architecture.

## Read before editing

`PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/KNOWN_ISSUES.md`, and relevant engineering history.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Test data should never become a real user-facing suspension. Prefer small changes and regression tests.
