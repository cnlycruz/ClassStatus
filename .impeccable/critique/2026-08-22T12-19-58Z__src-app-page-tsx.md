---
target: src/app/page.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-22T12-19-58Z
slug: src-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2 | Freshness, loading, fallback, and verification state are not clear at the decision point. |
| 2 | Match System / Real World | 4 | The Filipino question, LGU labels, schools, and official-source model fit the audience. |
| 3 | User Control and Freedom | 3 | Map reset, filters, view switching, and dismissals work; mobile detail exit is less explicit. |
| 4 | Consistency and Standards | 3 | Status colors are consistent, but labels vary across views. |
| 5 | Error Prevention | 2 | Silent API fallback can be mistaken for confirmed live data. |
| 6 | Recognition Rather Than Recall | 3 | Clear labels and desktop legend help, but mobile loses a persistent legend. |
| 7 | Flexibility and Efficiency | 3 | Search shortcuts and map/list alternatives help; no quick LGU jump for repeat checks. |
| 8 | Aesthetic and Minimalist Design | 2 | Gradients, translucent panels, deep shadows, and animation add nonessential visual weight. |
| 9 | Error Recovery | 2 | Search recovery is clear; network freshness and clipboard failures are not actionable. |
| 10 | Help and Documentation | 2 | Sources exist, but no contextual explanation of status scope or uncertainty appears at the answer. |
| **Total** | | **26/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

The product model is authored for ClassStatus NCR: NCR geography, “May pasok ba?”, school lookup, status lifecycle, and source evidence are specific to a public-information utility. Visually, however, the home page slips toward an interchangeable live SaaS dashboard through its gradient hero, blurred translucent panels, oversized rounding, heavy shadows, and pulse effects. The deterministic scan found no violations in `src/app/page.tsx` (0 findings), so the more important issues are hierarchy and civic trust rather than a detector rule.

Browser evidence confirmed the rendered home page at localhost with the header, advisory banner, status counters, NCR map, and Manila detail panel. No user-visible detector overlay was available because the browser binding allowed only read-only evaluation.

## Overall Impression

The page has a strong core: it makes a complex regional status model explorable. Its biggest opportunity is to make confidence and personal relevance more immediate than dashboard decoration.

## What's Working

- “May pasok ba?” is a direct, culturally natural opening for an anxious student.
- The status model preserves critical nuance: active, partial, upcoming, awaiting, levels, and official evidence.
- The map is a genuine product-specific control with labeled LGU paths, keyboard selection, reset, and zoom affordances.

## Priority Issues

- **[P1] Trust state is too weak for the urgency of the claim.** The page can make fallback, awaiting, or unverified information feel like a confirmed live advisory. Put `Last checked`, coverage, and `Verified / Awaiting / Demo or fallback` beside the main answer; make the headline conditional on confidence. Suggested command: `$impeccable harden`.
- **[P1] The home page answers NCR before it answers “my school.”** A student often needs a personal answer rather than a map-literacy task. Place an explicit school/LGU lookup directly below the opening question; preserve the map as the regional browse view. Suggested command: `$impeccable layout`.
- **[P2] Mobile map comprehension depends on color and hidden desktop affordances.** The desktop-only legend and filter dimming leave phone users without a persistent text key. Keep a compact mobile legend, announce filter/selection state in text, and provide an explicit all-status reset and sheet return affordance. Suggested command: `$impeccable adapt`.
- **[P2] The visual language conflicts with the restrained public-service brief.** Gradient, backdrop blur, ping/pulse, large radii, and deep shadows read as SaaS rather than calm civic information. Use a solid accessible civic-blue field, reserve elevation for the selected advisory, and remove ambient decoration. Suggested command: `$impeccable quieter`.
- **[P2] Status vocabulary fractures across views.** “Normal,” “Classes Open,” “Open,” and “Classes Continue” create needless interpretation. Define and reuse exactly: `Suspended`, `Partial suspension`, `Classes continue`, and `Awaiting official update`. Suggested command: `$impeccable clarify`.

## Persona Red Flags

- **Alex (power user):** `/` and `Ctrl/Cmd+K` are useful, but repeat checks still require map scanning or typing; there is no direct LGU jump, recent location, or visible shortcut cue.
- **Jordan (first-timer):** “Awaiting,” “Partial,” and “Tomorrow” carry meaningful consequences but are not defined where the main decision occurs. The four metric tiles do not clearly communicate that they are filters.
- **Sam (accessibility-dependent):** Keyboardable map paths and ARIA labels are strong. Mobile lacks the persistent text legend, and filter dimming plus mobile sheets need stronger nonvisual state and focus-management evidence.
- **Casey (distracted mobile user):** School search is accessible in the hero, but nav, filters, map controls, and detail behavior compete in the top half of a long mobile flow.

## Minor Observations

- Avoid unsupported promotional wording such as “Metro Manila’s premier” in a civic tool.
- The one-second “LIVE” clock and pulse effects imply more operational freshness than the data refresh signal proves.
- Use one consistent search label across the hero and navbar.
- Label share as “Copy advisory” unless native sharing is implemented.

## Questions to Consider

- If no official LGU announcement has been collected, should the main answer ever look like verified “classes continue”?
- Can a student learn their own attendance status in five seconds without map literacy?
- What would a calm emergency-bulletin visual language retain that a startup dashboard would remove?
