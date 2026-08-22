# Admin Console dependency review

Review date: 2026-08-23 (Asia/Manila)

- Framework: Next.js 15.5.23. No Next.js 16 migration was performed.
- Initial production audit: three high-severity findings, aggregated through Next.js dependencies on PostCSS 8.4.31 and Sharp 0.34.5.
- PostCSS advisories: GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, and GHSA-r28c-9q8g-f849. The affected parser is build infrastructure here; ClassStatus does not accept or process administrator/public CSS input. It was nevertheless upgraded to 8.5.26 through a compatible npm override.
- Sharp advisory: GHSA-f88m-g3jw-g9cj. ClassStatus has no image upload or user-controlled image processing path. Sharp was nevertheless upgraded to 0.35.3 through a compatible npm override.
- Verification: Next.js 15 production build and all tests pass with the overrides.
- Final command: `npm audit --omit=dev` reports zero vulnerabilities.

These overrides must be revalidated whenever Next.js is upgraded. A future Next.js major migration remains a separate task.
