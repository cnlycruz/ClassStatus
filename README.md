# ClassStatus NCR — Local Development

ClassStatus is an independent class-suspension tracker for Metro Manila. It covers all 17 NCR LGUs, school search, evidence-backed statuses and collector diagnostics.

**This branch is a local development environment, not a live public class-suspension service.** Official announcements from schools, LGUs and education authorities remain the source of truth.

## Requirements

- Node.js 22.x
- npm 10.x
- No Vercel, cloud database, hosting account or cloud scheduler required

## Start on your computer

```bash
git clone https://github.com/cnlycruz/ClassStatus.git
cd ClassStatus
npm ci
```

Copy `.env.example` to `.env.local` and leave `CLASSSTATUS_STORAGE_DRIVER=local-json`. Then:

```bash
npm run dev
```

Open **http://localhost:3000**.

Windows users can also launch the existing `run-local.ps1` script. Generated local JSON state is written to `CLASSSTATUS_DATA_DIR` (default `./data`) and ignored by Git. If you previously used a cloud-backed `.env.local`, replace it with the local template; do not copy its secrets.

### Local admin

The protected `/collector` console is optional and stays authenticated. To configure it, generate the Argon2 password hash with `npm run admin:hash-password` and set `CLASSSTATUS_ADMIN_USERNAME`, `CLASSSTATUS_ADMIN_PASSWORD_HASH`, and a Base64-encoded random 32-byte-or-longer `CLASSSTATUS_SESSION_SECRET` in `.env.local`.

### Collector

```bash
npm run collect
```

Collection is **manual**, unless you later configure a separate local scheduler. It reads only the operational GMA and Rappler sources, makes real external HTTP requests, parses candidate articles, and stores evidence-backed data in local files. It rejects ambiguous, stale or unsupported claims rather than inventing class suspensions. Stopped collection does not imply classes are ongoing.

### Development checks

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

### Limitations

- Local JSON storage and local admin authentication are not designed for a public multi-user deployment.
- Never expose the local development server to the public Internet.
- Browser push notifications are optional and require a supported secure browser context, active subscriptions and VAPID settings.
- Share/export previews from this branch are development artifacts, not authoritative announcements.
- Cloud deployment/DB migrations were removed from active source, but historical decisions remain in Git history.

Read [PRODUCT.md](PRODUCT.md), [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
