# Checkpoint #2 demo script

About 5 minutes. It covers the AI parser, the review step, candidate generation and the travel matrix on a map.

## Before the demo

1. `.env.local` has `GEMINI_API_KEY` and a real contact in `APP_USER_AGENT`, and `MIDWAY_USE_MOCKS=false`.
2. `npm run dev` is running, and [http://localhost:3000](http://localhost:3000) is open.
3. **Warm the caches:** run the sample group through once before presenting. Place lookups and drive times are cached in memory, so the live run is near-instant. Don't restart the server afterwards, or the cache is lost.
4. Have a second terminal ready in case you need to switch to mock mode (see the end).

## Script

### 1. Input (`/`)

- Click **Load sample group**. Point out the deliberately messy input:
  - Maya: a precise address (`233 S Wacker Dr, Chicago`)
  - Jordan: "somewhere between Fort Wayne and Toledo"
  - Priya: "somewhere in Ohio", "cheap"
  - Sam: "next Saturday, maybe Sunday too?", "whatever works"
- Click **Find a meeting point**.

### 2. AI parse and review (`/review`)

- While it loads, say: *one batched Gemini call, then each place is looked up on OpenStreetMap at one request per second.*
- Point out:
  - **Interpretation beside the original text**: Jordan becomes *Between places* with two resolved anchors and a midpoint, and Priya becomes *Broad area* (center of Ohio).
  - **Confidence highlighting**: amber and red borders and the warnings, especially Priya's area warning and Sam's tentative availability.
  - Structured availability windows (Sam's "next Saturday" resolved to a real date) and budgets (`$25-30` → max 30, "cheap" → level low, "whatever works" → left open).
- **Edit and re-check:** change Priya's location to `Columbus, OH` and click **Re-check location**. The interpretation updates to a specific place, and an "Edited by you" badge appears.
- Mention the ethics point: *nothing continues until the user confirms; the button stays disabled if any member has no location.*
- Click **Looks right, find meeting spots**.

### 3. Candidates and travel times (`/results`)

- Map: blue pins are members and numbered orange pins are candidate towns. Attribution is in the corner (OpenStreetMap contributors, OSRM).
- Click a candidate pin to see each member's drive time and distance.
- Table: candidates × members. Point out that **candidates are not ranked**. They are in generation order, and scoring is Checkpoint #3.
- Open **How were these candidates chosen?** and explain the seeds:
  - spherical centroid (average of 3D vectors, not lat/lng)
  - geometric median (least *total* distance)
  - **minimax center**, the fairness seed (smallest *longest* trip)
  - a ring of 4 points around the centroid for variety
  - each seed snapped to a real town: the town it falls in, or else the nearest named town within 30 km. That's why there are no pins in lakes or fields.
- Mention the caveats shown on the page: free-flow drive estimates with no traffic, and public best-effort servers.

## If a public server is slow or down

Symptoms: `/review` or `/results` shows an error, a "nearby-town search didn't respond" note, or a load that takes more than about 30 s.

1. Click **Try again** once (failed lookups aren't cached).
2. If that doesn't help, switch to **mock mode**:
   - Set `MIDWAY_USE_MOCKS=true` in `.env.local`.
   - Stop and restart `npm run dev` (Next.js only allows one dev server per project folder).
   - Go back to `/`, click **Load sample group**, and run the flow again. A blue **Mock mode** banner shows on `/review` and `/results`.
   - In mock mode, parsing is rule-based, places come from a built-in Midwest list, and drive times are estimates. Say so; the banner does too.
3. If Gemini itself fails (quota or network) but OSM works, the review page still loads. Each entry is marked low confidence with its location used as typed, and you can fix entries by hand. That's the fallback path, and it's worth showing on purpose too.
