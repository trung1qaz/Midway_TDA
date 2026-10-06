# Roadmap

This is a living document. Statuses reflect the state of the repository as of **October 6, 2026**, and should be updated as work lands.

**Status key:** ✅ Done · 🟡 Partial · 🚧 In progress · ⬜ Not started

## Checkpoints

| Checkpoint | Target date | Scope | Status |
| --- | --- | --- | --- |
| #1 | Sept 21 | Multi-person input form and project scaffold, with a working geocoding API connection | ✅ Done |
| #2 | Oct 5 | AI input parser, midpoint candidate generation, travel time/distance matrix (originally Google Distance Matrix, now OSRM), candidates on a map | ✅ Done (details and caveats below) |
| #3 | Oct 26 | Scoring engine, live Open-Meteo weather integration, ranked results screen | ⬜ Not started |
| #4 | Nov 16 | AI explanation generator, venue/activity suggestions, full end-to-end flow | ⬜ Not started |
| Final | Dec 1–4 | Final materials and live demos | ⬜ Not started |

### Checkpoint notes

- **#1:** Next.js + TypeScript + Tailwind scaffold, a multi-person input form, `sessionStorage` hand-off, and a hardcoded Nominatim geocoding test route. That test route was removed in #2, and its logic now lives in `lib/geo/nominatim.ts`.
- **#2:**

  | Item | Status | Notes |
  | --- | --- | --- |
  | AI input parser | ✅ | Gemini (`@google/genai`, JSON-schema structured output) with one batched call per submission. zod validates each member, with per-member fallbacks. Handles between/area locations, vague budgets and relative dates. **Not yet verified against live Gemini in this repo; no API key was configured when it was built.** The full flow was verified in mock mode. Polishing for unparseable input is a later workplan item. |
  | Geocoding of parsed anchors | ✅ | Nominatim behind a `Geocoder` interface, with a shared 1 request/second throttle and cache. Effective location is the midpoint of the anchors for "between". |
  | Review and confirm step | ✅ | `/review` shows interpretation beside the original text, highlights confidence and warnings, and supports re-checking an edited location plus direct edits to availability and budget. Confirm is blocked until every member has coordinates. |
  | Candidate generation | ✅ | Centroid, geometric median, minimax (exact, Welzl) and a 4-point ring, plus 1-member, 2-member and same-place cases. Seeds snap to real towns, with an Overpass nearby-town fallback. Up to 7 deduped candidates, each labelled with the strategy that produced it. Verified live: the sample group gives 7 real towns. |
  | Travel matrix | ✅ | OSRM `table`, one request, `null` treated as "no route", 50-coordinate cap. Free-flow driving estimates only (no traffic). |
  | Map and raw data | ✅ | Leaflet + OSM tiles, member and numbered candidate pins, popups with drive times, candidates × members table, attribution. **Unranked by design**: ranking is #3. |
  | Mock mode and sample group | ✅ | `MIDWAY_USE_MOCKS=true` runs the whole flow offline with no key. The "Load sample group" button is on the form. |
  | Tests | ✅ | 54 Vitest tests over pure logic, with no live network calls. |

  Known limitations: the public OSM servers are best-effort. A cold candidates request measured 8–31 s, and Overpass in particular can be slow or busy. Mock mode only knows a fixed list of Midwest places. Mobile layout has not been polished.
- **#3:** Not started. `/results` lists candidates in generation order with raw travel data and no scores.
- **#4:** Not started.

## Core features

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Multi-Person Input | ✅ Implemented | Free-text form for any number of members, an AI parser to structured data, and a review/confirm step. |
| 2 | Midpoint Generation | ✅ Implemented | Several geometric seeds snapped to real towns (so no lakes or fields), deduped, each with an explained strategy. Avoiding specific terrain *on request* is not built. |
| 3 | Scoring Engine | ⬜ Planned (#3) | Will score each location per member on travel time (OSRM data is already available), estimated cost and weather, then average into a group score. |
| 4 | Map and Ranked Results | 🟡 Partial | Map with pins, popups and raw travel data is done. Ranking and "click a pin to see its score" wait on the scoring engine. |
| 5 | AI Explanation and Venue Suggestions | ⬜ Planned (#4) | A plain-language explanation of trade-offs, plus activity suggestions. |
