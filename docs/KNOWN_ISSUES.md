# ClassStatus — local development limitations

- No hosted collector scheduler. Run `npm run collect` manually until an explicitly designed local scheduler is introduced.
- Only GMA and Rappler Tier 3 collectors are operational. Official LGU/DepEd/CHED sources are not yet production-ready.
- News feed markup and article formats can change. Monitor health reports and maintain parsing fixtures.
- Local JSON persistence is not suited for public concurrent multi-user use.
- Local notification and Web Push delivery must be tested in a supported secure browser with VAPID configured.
- No live Supabase project exists for this branch and no cloud deployment is configured.
- Do not present development fixture records as actual current class suspension decisions.

Resolved bugs and previous hosted architecture are documented in `docs/ENGINEERING_HISTORY.md` and Git history.
