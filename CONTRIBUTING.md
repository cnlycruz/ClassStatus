# Contributing to ClassStatus

Thank you for helping improve ClassStatus. Contributions should preserve its purpose as a cautious public-information tool: correctness, provenance, freshness, uncertainty, accessibility, and fail-closed behavior take priority over convenience.

## Before you start

1. Read [README.md](README.md), [PRODUCT.md](PRODUCT.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. For regressions or fragile areas, also review [docs/ENGINEERING_HISTORY.md](docs/ENGINEERING_HISTORY.md) and [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).
3. Open an issue for a substantial behavior or policy change before investing in an implementation.

Use Node.js 22.x, run `npm ci`, and copy `.env.example` to `.env.local` if your work needs environment variables. Use placeholders or local-only credentials; never commit secrets or production data.

## Development expectations

- Keep changes focused and avoid unrelated rewrites.
- Do not fabricate suspension records or weaken validation, attribution, freshness, or publication safeguards.
- Keep all 17 logical NCR LGUs. Geographic corrections must cite a verifiable source and preserve required license notices.
- Add or update tests for behavior changes and regressions.
- Do not include generated local state, build output, credentials, or identifying production configuration.
- Report security issues privately according to [SECURITY.md](SECURITY.md).

Run the full checks before opening a pull request:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
git diff --check
```

In the pull request, explain the problem, the chosen change, its risks, and how it was verified. Include screenshots only when visual behavior changes, and remove private information from them.

By submitting a contribution, you agree that it may be distributed under the repository's [MIT License](LICENSE).
