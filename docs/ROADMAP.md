# Roadmap

This is a living document. Statuses reflect the state of the repository as of **September 23, 2026**, and should be updated as work lands.

**Status key:** ✅ Done · 🚧 In progress · ⬜ Not started

## Checkpoints

| Checkpoint | Target date | Scope | Status |
| --- | --- | --- | --- |
| #1 | Sept 21 | Multi-person input form and project scaffold, with a working geocoding API connection | ✅ Done |
| #2 | Oct 5 | AI input parser, midpoint candidate generation, Google Maps Distance Matrix integration | ⬜ Not started |
| #3 | Oct 26 | Scoring engine, live Open-Meteo weather integration, ranked results screen | ⬜ Not started |
| #4 | Nov 16 | AI explanation generator, venue/activity suggestions, full end-to-end flow | ⬜ Not started |
| Final | Dec 1–4 | Final materials and live demos | ⬜ Not started |

### Checkpoint notes

- **#1:** The Next.js + TypeScript + Tailwind scaffold is in place. The multi-person input form (`components/MemberForm.tsx`) works and passes its data to `/results` via `sessionStorage`. The geocoding connection is a hardcoded smoke-test route (`app/api/test-geocode/route.ts`). The proposal specified the **Google Maps Geocoding API**, but the route uses **OSM Nominatim**, so the checkpoint demo doesn't need billing set up. The route is not yet called from the UI.
- **#2:** No work yet. The `Member` fields are still unparsed free text.
- **#3:** `/results` exists as a placeholder that lists the submitted member data. It has no scoring, weather or ranking yet.
- **#4:** No work yet.

## Core features

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Multi-Person Input | 🚧 Partially implemented | The form collects name, location, availability and budget as free text for any number of members. The AI input parser that turns this into structured data is **planned**. |
| 2 | Midpoint Generation | Planned | Candidate points based on member locations. Favors plausible destinations over a raw geometric center and avoids impractical spots (rivers, mountains) unless the group specifies otherwise. |
| 3 | Scoring Engine | Planned | Scores each location separately for each member on travel time, estimated cost, weather and custom metrics. Averages these into a group score per location. |
| 4 | Map and Ranked Results | Planned | Top-scoring locations as pins on an interactive map. Clicking a pin explains its score. A placeholder `/results` page exists. |
| 5 | AI Explanation and Venue Suggestions | Planned | A raw data/graph view plus a plain-language written explanation, and activity suggestions at each location. |
