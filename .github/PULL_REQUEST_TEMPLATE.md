## Summary

Describe the problem and the focused change that addresses it.

## Risk and correctness

- Which user, data, collector, security, or deployment behavior could be affected?
- How does the change preserve attribution, freshness, uncertainty, accessibility, and fail-closed behavior?

## Verification

List the tests and manual checks performed. Include sanitized screenshots only for visible UI changes.

## Checklist

- [ ] The change is focused and contains no credentials, personal data, generated state, or private deployment details.
- [ ] Relevant tests and documentation are updated.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check` pass.
- [ ] New or changed third-party material includes provenance and required license notices.
- [ ] Security-sensitive issues were reported privately according to `SECURITY.md`.
