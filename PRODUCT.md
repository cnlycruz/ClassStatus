# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are Metro Manila students, especially senior high school and college students checking class-suspension updates on their phones. Parents or guardians, teachers, and school staff are secondary users who need to check an LGU's or school's status.

## Product Purpose

ClassStatus NCR helps people quickly and safely answer “May pasok ba?” by showing class-suspension status across all 17 Metro Manila LGUs and relevant schools. Success means users can understand the current, upcoming, or expired status and reach its supporting announcement without ambiguity.

## Positioning

ClassStatus NCR combines an interactive NCR-wide status view, school lookup, and attributable official-source evidence in one mobile-first public-information tool. It distinguishes active, upcoming, expired, verified, and uncertain information rather than presenting an unqualified answer.

## Operating Context

Users commonly check the site on mobile during typhoons, monsoon rains, extreme heat, transport strikes, and other disruptions. The application uses Asia/Manila time and covers all 17 NCR LGUs, including geographically separated Caloocan territories as one LGU and Manila as one city. Official LGU, DepEd, CHED, PAGASA, and school announcements are authoritative; reputable media is secondary confirmation.

## Capabilities and Constraints

The product provides an accessible interactive map, LGU details, school and university search with aliases and campuses, source evidence, a sources registry, collector status, and a resilient automated announcement collector. It is a Next.js 15, TypeScript, Tailwind CSS application with a lightweight local persistence approach. Live status is derived only from evidence-backed Tier 3 collector records. Collector failures or ambiguous data must not mislead users or crash the site.

## Brand Commitments

Preserve the ClassStatus NCR name, existing logo treatment, colors, status colors, typography, and public-service dashboard character. The interface should be credible, fast, mobile-first, polished, accessible, and student-friendly. Avoid generic AI/SaaS styling, excessive gradients, glassmorphism, decorative cards, and unnecessary visual effects. Support light and dark themes.

## Evidence on Hand

The repository contains the current ClassStatus NCR implementation, logo at `LOGO.PNG`, interactive NCR geometry, source registry, collector architecture, clean live storage, and automated fixture tests. No formal seals or additional official brand assets are required.

## Product Principles

- Answer the attendance question before asking users to explore.
- Treat official evidence, timing, and uncertainty as part of the status—not secondary detail.
- Design first for a fast, one-handed mobile check during disruption.
- Make every interactive and collector outcome understandable, accessible, and recoverable.
- Preserve a restrained public-service interface over decorative product styling.

## Accessibility & Inclusion

Provide semantic structure, keyboard-accessible map controls and selections, clear focus states, sufficient contrast, screen-reader-friendly status descriptions, touch-friendly controls, and reduced-motion support.
