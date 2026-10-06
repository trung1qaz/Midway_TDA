# Midway

When a group is spread across different cities, choosing a fair place to meet can stall a group chat. People argue about driving distance, price and other factors. Midway collects each member's approximate location, schedule and budget. It then generates candidate meeting points, scores each one on the criteria the group cares about, and explains the trade-offs in plain language, so the group can decide quickly and fairly.

> **Status (Checkpoint #2):** Free-text input is parsed by AI (Gemini), checked by the user on a review page, and turned into candidate meeting towns. Those towns are shown on a map with everyone's drive time and distance. Scoring, ranking, weather and AI explanations are still planned. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Tech stack

- **Next.js (App Router) + TypeScript**: UI and server-side API routes
- **Tailwind CSS**: styling
- **Gemini API** (`@google/genai`, free tier): parses free-text member input into structured data
- **zod**: validates every AI response and API request
- **OpenStreetMap services** (no keys, no billing): **Nominatim** for geocoding, **Overpass** for finding nearby towns, **OSRM** for drive-time matrices, and **Leaflet** + OSM tiles for the map
- **Vitest**: unit tests
- *Planned:* Open-Meteo weather, scoring engine, AI explanations. FastAPI is deferred; business logic lives in `lib/` so it can move later.

No Google Maps Platform API is used.

## Getting started

Requires Node.js 22.12+ or 24+ (Vitest 5 needs it; developed on Node 24) and npm.

```bash
git clone <repo-url>
cd midway
npm install
cp .env.local.example .env.local
```

Edit `.env.local`:

1. **`GEMINI_API_KEY`**: the only key you need. Get a free one at [Google AI Studio](https://aistudio.google.com/apikey). No billing is required. Free-tier inputs may be used by Google to improve its products, so use test data (see [docs/ETHICS.md](docs/ETHICS.md)).
2. **`APP_USER_AGENT`**: replace `your-email@example.com` with a real contact. The Nominatim, Overpass and OSRM usage policies require it.
3. Leave the OSM base URLs at their defaults unless you self-host.

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000), click **Load sample group**, and submit.

### No key or no network? Use mock mode

Set `MIDWAY_USE_MOCKS=true` in `.env.local` and restart `npm run dev`. The parser, geocoder, nearby-town search and router then use built-in fixtures (`lib/mocks`), so the whole flow works offline. Only a fixed list of Midwest places can be found in this mode.

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini parser (server-side only) | required unless mock mode |
| `GEMINI_MODEL` | Gemini model name | `gemini-flash-latest` |
| `NOMINATIM_BASE_URL` | geocoding | `https://nominatim.openstreetmap.org` |
| `OSRM_BASE_URL` | drive-time matrix | `https://router.project-osrm.org` |
| `OVERPASS_URL` | nearby-town search | `https://overpass-api.de/api/interpreter` |
| `APP_USER_AGENT` | identifies the app to OSM services | a built-in project identifier |
| `MIDWAY_USE_MOCKS` | use fixtures instead of live services | `false` |

Never commit `.env.local`.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (no network) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): stack, modules, data flow, rate limits and env vars
- [Roadmap](docs/ROADMAP.md): checkpoint timeline and feature status
- [Ethics](docs/ETHICS.md): privacy, third-party data use and AI accuracy
- [References](docs/REFERENCES.md): bibliography and API documentation
- [Checkpoint #2 demo script](docs/CHECKPOINT-2-DEMO.md)
