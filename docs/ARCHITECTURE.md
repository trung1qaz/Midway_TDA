# Architecture

This is a living document. It describes the code as it exists today and marks anything not yet built as **planned**.

## Why Midway is built this way

General-purpose mapping tools let one person search around their own location. Finding a fair midpoint for a group by hand takes geometry that most people won't do. Even a correct geometric midpoint ignores weather and cost, and it may not be reachable at all (for example, it could land in the middle of a lake). Prior academic work on optimal meetup locations has mostly minimized a group's *total* travel cost. That is not the same as distributing that cost *fairly*, and it doesn't account for non-travel factors. Midway scores candidate locations on several criteria that the group controls, which fills that gap. The stack choices below support that goal.

## Tech stack

| Layer | Choice | Status | Why |
| --- | --- | --- | --- |
| Frontend and API routes | Next.js (App Router) + TypeScript | Implemented | One framework covers both the UI and lightweight server routes. TypeScript keeps the shared data shapes (such as `Member`) consistent between the form, storage and results. |
| UI | Tailwind CSS (v4) | Implemented | Fast iteration on a form-heavy UI without a separate styling system. |
| Geocoding | OSM Nominatim | Implemented (test route only) | Turns member locations into coordinates, which every later stage needs. It is free and needs no API key. The proposal named Google's Geocoding API, and commit `b7b2cde` switched to Nominatim so the checkpoint demo wouldn't need billing set up. Nominatim's usage policy requires a descriptive User-Agent and at most 1 request per second. |
| Maps and travel data | Google Maps Platform (maps, Distance Matrix) | Planned | Provides the interactive results map, and real travel times so candidates are scored on reachability rather than straight-line distance. |
| Weather | Open-Meteo API | Planned | Weather is one of the non-travel factors that aggregate-travel-cost approaches ignore. The free tier needs no key. |
| Backend | FastAPI (Python) | Planned | A dedicated service for midpoint generation and the scoring engine. |
| Generative AI | LLM (e.g. Gemini API) | Planned | Parses vague free-text input into structured data, and writes plain-language explanations of each location's trade-offs. |

## Folder structure

This tree was generated from the repository. It leaves out `node_modules/`, `.next/`, `.git/` and other generated files.

```
midway/
├── app/                      # Next.js App Router
│   ├── api/
│   │   └── test-geocode/
│   │       └── route.ts      # TEMPORARY GET route: geocodes one hardcoded address via Nominatim
│   ├── results/
│   │   └── page.tsx          # /results: shows the submitted member data (placeholder for real results)
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx            # Root layout (fonts, global styles)
│   └── page.tsx              # /: landing page with the member input form
├── components/
│   └── MemberForm.tsx        # Multi-person input form (add/remove members, submit)
├── lib/
│   └── memberStorage.ts      # Saves/loads members via sessionStorage
├── types/
│   └── member.ts             # Shared Member interface
├── public/                   # Static assets (create-next-app defaults)
├── docs/                     # Project documentation
├── .env.local.example        # Environment variable template (no keys required yet)
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

## Data model

`types/member.ts` defines one shared type:

```ts
interface Member {
  name: string;
  location: string;      // free text, e.g. "somewhere near downtown Chicago"
  availability: string;  // free text, optional
  budget: string;        // free text, optional
}
```

All fields are currently raw strings. Turning them into structured data (coordinates, time ranges, price limits) is the job of the planned AI input parser.

## How the pieces fit together

```
[1] Multi-person input ──► [2] Parse & geocode ──► [3] Midpoint generation ──► [4] Scoring ──► [5] Map, ranked results & AI explanation
     (implemented)            (partial)               (planned)                  (planned)        (placeholder page only)
```

### 1. Multi-person input (implemented)

`app/page.tsx` renders `MemberForm`. Users can add or remove any number of members, and each member has a name, location, availability and budget. Name and location are required. On submit, the form drops members that are missing a name or location, saves the rest to `sessionStorage` under the key `midway.members` (see `lib/memberStorage.ts`), and navigates to `/results`. `sessionStorage` was chosen as the simplest way to pass free-text data between pages without a backend. As a result, the data stays in the browser tab and is lost when the tab closes.

### 2. Parse and geocode (partial)

- **Geocoding:** `app/api/test-geocode/route.ts` is a temporary smoke test. A `GET /api/test-geocode` request geocodes a hardcoded address through Nominatim and returns `{ address, lat, lng }`. The UI does not call this route yet. Its purpose is to prove the request pipeline works.
- **AI input parser (planned):** will turn vague free text (e.g. "somewhere between point A and B") into structured location, availability and budget data. The member will then see a confirmation step before continuing (see [ETHICS.md](ETHICS.md)).

### 3. Midpoint generation (planned)

Will generate candidate meeting points from the members' locations. It will favor plausible destinations over a raw geometric center, and avoid impractical spots such as rivers or mountains unless the group asks for them.

### 4. Scoring engine (planned)

Will score each candidate location separately for each member on travel time (via Google Maps Distance Matrix), estimated cost and weather (via Open-Meteo), plus any custom metrics. Each location's per-member scores will be averaged into a group score.

### 5. Results, map and explanation (placeholder only)

`app/results/page.tsx` exists today, but it only lists the submitted member data. It notes that geocoding, midpoint generation, scoring and maps will come later. The planned version will:

- show the top-scoring locations as pins on an interactive map
- explain a location's score when the user clicks its pin
- offer a raw data/graph view as well as a plain-language AI-written explanation
- suggest venues and activities at each location
