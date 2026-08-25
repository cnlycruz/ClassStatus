# 🇵🇭 Class Status NCR — Metro Manila Class Suspension Tracker

> **“May pasok ba?”** — Real-time interactive class suspension status and automated advisory collector for all 17 Metro Manila Local Government Units (LGUs).

---

## 🌟 Overview & Highlights

**Class Status NCR** is an end-to-end web application for students, parents, and educators in the National Capital Region (NCR), Philippines. It tracks evidence-backed reports from approved media sources while preserving links to the reporting article.

### ✨ Key Features

1. **Interactive Geographic NCR Vector Map**:
   - Geographically accurate vector boundaries for all **17 NCR LGUs**.
   - Accurately renders **Caloocan's geographically separated North and South territories** while preserving unified citywide status.
   - Smooth SVG pan & zoom (drag, mouse wheel, +/- controls, reset view).
   - Dynamic status color coding: **Suspended** (Coral/Red), **Partial** (Amber/Orange), **Classes Continue** (Emerald/Green), and **Awaiting Info** (Slate).
   - High-contrast, accessible keyboard navigation (`Tab`, `Enter`/`Space`) and screen-reader ARIA semantics.

2. **Automated Information Collector Engine**:
   - Modular plug-and-play adapter architecture (`src/collector/`).
   - Tier 3 media trackers (Rappler and GMA News) are the sole operational sources; Tier 1 and Tier 2 are hard-disabled while under development.
   - Source-specific listing/article extraction with canonical URLs, publication metadata, and evidence excerpts.
   - Conservative Filipino/English normalization requiring explicit LGU, date, education level, sector, and suspension action.
   - Event-aware deduplication, conflict holds, and confidence promotion after independent corroboration.
   - Fail-closed execution: blocked or malformed sources publish no fallback records.
   - Standalone CLI runner: `npm run collect`.

3. **Status Lifecycle State Machine (Asia/Manila PHT)**:
   - Evaluates: `Discovered` → `Parsed` → `Validated` → `Upcoming` → `Active` → `Expired`.
   - **Advance Notice Support**: Announcements declared tonight for *tomorrow* immediately flag as **Upcoming Tomorrow** with distinct badges.
   - Strict timezone locking to `Asia/Manila` (UTC+8).

4. **School & University Instant Finder**:
   - 50+ major NCR higher education institutions (UST, DLSU, PUP, UPD, ADMU, FEU, NU, CEU, PLM, MAPUA, CSB, San Beda, Adamson, etc.).
   - Rich alias & acronym search dictionary with multi-campus awareness.

5. **Transparency & Reliability Tiers**:
   - Dedicated `/sources` registry detailing monitored endpoints, check intervals, and reliability tiers.
   - Dedicated `/collector` console for live sweep triggers and real-time log inspection.

6. **Design & Accessibility**:
   - Modern, student-friendly visual system with custom Tailwind color tokens.
   - Seamless **Light & Dark mode** with system preference detection and localStorage persistence.
   - Fully responsive on mobile phones with swipeable bottom sheets.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 15 (App Router, Server & Client Components)
- **Language**: TypeScript (Strict typing across all models)
- **Styling**: Tailwind CSS with custom status tokens and dark theme support
- **Icons**: Lucide React
- **HTML Parsing / Web Scraping**: Cheerio
- **Testing**: Vitest test suite

---

## 📁 Clean Folder Structure

```
CSAGY/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── collector/
│   │   │   │   ├── logs/route.ts      # GET collector execution logs
│   │   │   │   ├── run/route.ts       # POST on-demand sweep trigger
│   │   │   │   └── sources/route.ts   # GET & PUT source feed configs
│   │   │   ├── demo-mode/route.ts     # POST clear live Tier 3 records
│   │   │   ├── lgus/route.ts          # GET 17 LGUs with derived status
│   │   │   ├── schools/route.ts       # GET search schools & live status
│   │   │   └── suspensions/route.ts   # GET records; public writes disabled
│   │   ├── about/page.tsx             # About & methodology
│   │   ├── collector/page.tsx         # Collector management console
│   │   ├── sources/page.tsx           # Monitored sources transparency
│   │   ├── globals.css                # Custom CSS tokens & map styles
│   │   ├── layout.tsx                 # Root layout & Google Fonts
│   │   └── page.tsx                   # Main Home map & detail panel
│   ├── collector/
│   │   ├── sources/
│   │   │   ├── depedAdapter.ts        # Disabled Tier 1 placeholder
│   │   │   ├── lguPioAdapter.ts       # Disabled Tier 1 placeholder
│   │   │   ├── mediaAdapter.ts        # Live Tier 3 listing/article collector
│   │   │   ├── pagasaAdapter.ts       # Disabled Tier 1 placeholder
│   │   │   └── types.ts               # Source adapter contracts
│   │   ├── cli.ts                     # Standalone CLI script
│   │   ├── engine.ts                  # Orchestration, parsing & logs
│   │   ├── lifecycle.ts               # State machine & LGU status
│   │   ├── normalizer.ts              # Regex/NLP normalization engine
│   │   └── storage.ts                 # Atomic persistence layer
│   ├── components/
│   │   ├── Footer.tsx                 # Responsive footer & disclaimer
│   │   ├── LguDetailPanel.tsx         # Slide-out detail & share drawer
│   │   ├── ListView.tsx               # Card & table grid view
│   │   ├── Navbar.tsx                 # Top bar with live PHT clock
│   │   ├── NcrInteractiveMap.tsx      # Vector SVG map with pan/zoom
│   │   ├── SchoolFinderModal.tsx      # Autocomplete school search modal
│   │   ├── StatusHero.tsx             # Headline banner & live metrics
│   │   └── ThemeContext.tsx           # Light/Dark mode provider
│   ├── data/
│   │   ├── lgus.ts                    # 17 NCR LGU directory
│   │   ├── ncrGeoData.ts              # Precise vector SVG geometry
│   │   ├── schools.ts                 # 50+ universities & aliases
│   │   └── sources.ts                 # Monitored sources registry
│   ├── types/
│   │   └── index.ts                   # Complete TypeScript definitions
│   └── utils/
│       └── philippineTime.ts          # Asia/Manila timezone helpers
├── tests/
│   ├── collector.test.ts              # Policy, engine, storage & API flow
│   ├── mediaAdapter.test.ts           # Outlet HTML fixture extraction
│   ├── lifecycle.test.ts              # State transitions & PHT tests
│   ├── normalizer.test.ts             # Multilingual regex & safeguards
│   └── schools.test.ts                # School dataset & campus tests
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## 🚀 Getting Started

### 0. One-Click Quick Launch (PowerShell)
You can start the dev server and automatically launch the browser in a single step:
```powershell
.\run-local.ps1
```

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Web Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run the Automated Collector (CLI)
You can trigger the automated information collector directly from your terminal:
```bash
npm run collect
```
This executes eligible Tier 3 adapters, normalizes explicit LGU announcements, updates deduplicated live records, and logs source failures or rejected/held statements. It never produces fallback announcements.

### 4. Run the Test Suite
Execute the full test suite with Vitest:
```bash
npm test
```

---

## 🔧 Developer Guides

### Production Operations

Production uses authenticated Supabase administrator sessions and narrowly
scoped signed collector RPCs with the publishable key. The hosted application
does not require a Supabase secret/service-role key. See
[`PRODUCTION_CUTOVER.md`](PRODUCTION_CUTOVER.md) for the two-migration launch,
verification, Preview retirement, and rollback procedure.

### How to Add a New Collector Source
1. Open `src/data/sources.ts`.
2. Add the source with an explicit `operationalState`. Only approved Tier 3 `news-reputable` entries are eligible for live collection.
3. Add a domain-restricted media profile and fixture coverage for its listing and article markup. Tier 1/2 entries remain non-operational until the central policy is deliberately changed.

### How to Update Geographic Boundaries
1. Open `src/data/ncrGeoData.ts`.
2. Edit the SVG path `d` attribute, `labelX`/`labelY` coordinates, or `badgeX`/`badgeY` anchor points.
3. For split LGUs (like Caloocan North and Caloocan South), keep the same `lguId: "caloocan"` so both polygons highlight together.

---

## ⚖️ Legal & Attribution Disclaimer

Class Status NCR is an open, independent public utility created for Filipino students and educators. Official declarations issued directly by respective Local Government Units, City Mayors, the Department of Education (DepEd), and individual university administrations remain the ultimate legal authority on class attendance.
