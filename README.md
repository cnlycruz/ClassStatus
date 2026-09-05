# ClassStatus NCR

ClassStatus is an independent, near-live class-suspension tracker for Metro Manila. It helps students, families, and educators check evidence-backed advisories across all 17 NCR local government units (LGUs) while keeping sources, timing, scope, and uncertainty visible.

> **Disclaimer:** ClassStatus is an independent project. It is not operated by, affiliated with, or endorsed by any Philippine government agency or local government unit.

Official announcements from the relevant LGU, school, or education authority remain the source of truth.

## Core features

- Interactive, keyboard-accessible SVG map for all 17 NCR LGUs, with one logical status for Caloocan's two geographic areas.
- Near-live dashboard updates with conservative, fail-closed status handling and visible source evidence.
- Map and list views, status filters, LGU details, and search across 49 school/campus records.
- Light and dark themes, responsive layouts, installable PWA support, and Web Push alert controls.
- A protected collector/admin surface and local JSON or hosted Supabase storage adapters.

See [Architecture](docs/ARCHITECTURE.md) for a public-safe technical overview and [Third-party notices](THIRD_PARTY_NOTICES.md) for data and font attribution.

## Prerequisites

- Node.js 22.x
- npm 10.x (the repository records the tested package-manager version)

## Local setup

```bash
git clone https://github.com/cnlycruz/ClassStatus.git
cd ClassStatus
npm ci
```

Copy `.env.example` to `.env.local`, keep the default `local-json` storage driver, and fill only the variables needed for your local workflow. Never commit `.env.local` or real credentials.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Generated local state is written to `CLASSSTATUS_DATA_DIR` (default: `./data`) and is ignored by Git.

## Development commands

```bash
npm run dev                 # development server
npm run collect             # run eligible local collector adapters
npx tsc --noEmit            # TypeScript validation
npm run lint                # ESLint
npm test                    # Vitest test suite
npm run build               # production build
npm start                   # serve the production build
```

Administrator access, hosted storage, scheduled collection, and Web Push are optional. Their variables are grouped and documented with placeholders in [.env.example](.env.example). Do not use real production values in issues, pull requests, fixtures, or screenshots.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Report suspected vulnerabilities privately using the instructions in [SECURITY.md](SECURITY.md); do not open a public security issue.

Data corrections must include a verifiable official source. ClassStatus intentionally does not infer or fabricate suspension declarations.

## License and attribution

ClassStatus source code is available under the [MIT License](LICENSE). Geographic data, fonts, and other third-party material retain their own notices and licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
