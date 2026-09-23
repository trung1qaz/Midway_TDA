# Midway architecture, v1 blueprint

**Scope.** This picture shows Midway's web app, from the group entering their details to a ranked, explained list of meeting places. It leaves out hosting, deployment and accounts.

The general reasoning behind the stack is in [docs/ARCHITECTURE.md](../../../../ARCHITECTURE.md). This page covers what the picture adds: which host each component runs on, what each one reads and writes, and who calls it.

## How a request moves through the system

1. A group member fills in the member form (`/`). On submit, `MemberForm` drops incomplete rows and `saveMembers` writes the rest to `sessionStorage` under `midway.members`.
2. `POST /api/parse` on the Next.js server runs `parseMemberInput`. It sends each member's free text to Gemini `generateContent` and gets structured fields back: coordinates, time ranges and price limits.
3. Each member confirms how their input was read, as `docs/ETHICS.md` requires. If anything is wrong they go back and edit it (step 1).
4. `POST /api/geocode` runs `geocodeLocation`, which asks Nominatim `/search` for each place's latitude and longitude. It keeps to Nominatim's limit of 1 request per second and sends a descriptive User-Agent. This route replaces the smoke-test route `GET /api/test-geocode`.
5. `POST /candidates` on the FastAPI backend runs `generate_candidates`. It picks real destinations and avoids lakes, rivers and mountains.
6. and 7. `POST /scores` runs `score_candidates`. It scores each candidate for each member on travel time (Distance Matrix API), weather (Open-Meteo `/v1/forecast`), cost and any custom metrics. It then averages each place's member scores into a group score and ranks the places.
8. The `/results` page reads the members back with `loadMembers` and shows the top places as pins through the Maps JavaScript API.
9. When a group member picks a pin, `POST /api/explain` runs `explainTradeoffs`. Gemini writes a plain-language explanation of that place's trade-offs and suggests venues there.

## Components

| Box | Kind | Host | Called by | Reads | Writes | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/` member form | ui | browser | the group member | | `sessionStorage` | built |
| `sessionStorage` (`midway.members`) | store | browser tab memory, lost when the tab closes | `saveMembers`, `loadMembers` | | | built |
| `POST /api/parse` | endpoint | Next.js | step 2 | member free text | | designed |
| `parseMemberInput` | code | Next.js | `POST /api/parse` | Gemini reply | | designed |
| `POST /api/geocode` | endpoint | Next.js | step 4 | place text | | designed |
| `geocodeLocation` | code | Next.js | `POST /api/geocode` | Nominatim results | | designed |
| `GET /api/test-geocode` | endpoint | Next.js | a developer, by hand | Nominatim, one fixed address | | built, temporary |
| `POST /candidates` | endpoint | FastAPI | step 5 | coordinates | | designed |
| `generate_candidates` | code | FastAPI | `POST /candidates` | | | designed |
| `POST /scores` | endpoint | FastAPI | steps 6 and 7 | candidates | | designed |
| `score_candidates` | code | FastAPI | `POST /scores` | Distance Matrix, Open-Meteo | | designed |
| `/results` page | ui | browser | step 8 | `sessionStorage`, Maps JavaScript API | | designed (a placeholder that lists members exists) |
| `POST /api/explain` | endpoint | Next.js | step 9 | scores | | designed |
| `explainTradeoffs` | code | Next.js | `POST /api/explain` | Gemini reply | | designed |
| Gemini `generateContent`, Nominatim `/search`, Distance Matrix API, Maps JavaScript API, Open-Meteo `/v1/forecast` | endpoint | their providers | the code boxes above | | | external services |

## Where each name comes from

| Name | Source |
| --- | --- |
| `Member` fields | `types/member.ts:1-6` |
| `saveMembers`, `loadMembers`, `midway.members` | `lib/memberStorage.ts:5`, `:7`, `:11` |
| `MemberForm` submit and navigation | `components/MemberForm.tsx:35-41` |
| `GET /api/test-geocode`, Nominatim, User-Agent | `app/api/test-geocode/route.ts:14`, `:15`, `:11` |
| `/results` placeholder reading `loadMembers` | `app/results/page.tsx:7-13` |
| The five stages, AI parser, scoring inputs, map and explanation | `docs/ARCHITECTURE.md`, "How the pieces fit together" |
| Confirmation step after parsing | `docs/ETHICS.md`, "Accuracy of AI-parsed input" |
| F1 to F5 | `docs/ROADMAP.md`, "Core features" |
| FastAPI for midpoint and scoring, Gemini, Distance Matrix, Open-Meteo | `docs/ARCHITECTURE.md`, "Tech stack" |

**Proposed in this version (not yet in the docs):** the route names `/api/parse`, `/api/geocode`, `/api/explain`, `/candidates` and `/scores`; the function names `parseMemberInput`, `geocodeLocation`, `explainTradeoffs`, `generate_candidates` and `score_candidates`; putting the parser, geocoder and explainer on the Next.js server; and choosing Gemini specifically (the docs say "e.g. Gemini API").
