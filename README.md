# Midway

When a group is spread across different cities, choosing a fair place to meet can stall a group chat. People argue about driving distance, price and other factors. Midway collects each member's approximate location, schedule and budget. It then generates candidate meeting points, scores each one on the criteria the group cares about, and explains the trade-offs in plain language, so the group can decide quickly and fairly.

> **Status:** Early development. The multi-person input form and project scaffold are in place, and there is a test route for geocoding. Midpoint generation, scoring, maps and AI features are still planned. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Tech stack

- **Next.js (App Router) + TypeScript**: frontend and API routes
- **Tailwind CSS**: UI styling
- **OSM Nominatim**: geocoding (currently used in place of Google Geocoding; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))
- **Google Maps Platform** *(planned)*: maps and Distance Matrix
- **Open-Meteo** *(planned)*: weather
- **FastAPI (Python)** *(planned)*: backend
- **Generative AI** *(planned)*: parsing free-text input and explaining trade-offs in plain language

## Getting started

Requires Node.js and npm.

```bash
git clone <repo-url>
cd midway
npm install
cp .env.local.example .env.local
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Environment variables

No environment variables are needed right now. Nominatim and Open-Meteo's free tier don't use API keys. [.env.local.example](.env.local.example) is the template, and new variables will be added there when integrations that need keys arrive. Never commit `.env.local`.

### Other scripts

| Command         | Purpose                  |
| --------------- | ------------------------ |
| `npm run build` | Production build         |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint               |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): tech stack rationale, folder structure and how the pieces fit together
- [Roadmap](docs/ROADMAP.md): checkpoint timeline and feature status
- [Ethics](docs/ETHICS.md): privacy and AI-accuracy considerations
- [References](docs/REFERENCES.md): bibliography and API documentation
