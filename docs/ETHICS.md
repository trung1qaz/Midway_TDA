# Ethical Considerations

This is a living document. Each section notes how the current code (Checkpoint #2) relates to the safeguard.

## Privacy of personal data within the group

Midway asks members to share their location, schedule and budget with their group, so the design has to be careful about what is exposed and to whom. Budget and schedule details can carry personal weight. For example, a member might not be able to afford a spot, or might be unavailable more often than others. By default, Midway shares only what the group needs to make its decision, not the underlying personal details.

*Current state:*

- Member data stays in the browser's `sessionStorage` and is gone when the tab closes. There is no database and no accounts, and nothing is persisted on the server. Server caches hold only place lookups and routing results (coordinates and place names), in memory, and they clear on restart.
- Server logs record failures (for example "Nominatim responded 503") but not member text or coordinates.
- The `/review` page shows every member's raw availability and budget. That is fine while one person enters the whole group, as the app does today. Once members enter their own details (planned), the review step should show each person only their own entry.

## Data sent to third-party services

Midway relies on external services. Member input leaves the browser in these specific ways, all from the server:

- **Gemini (Google).** Each member's name, location text, availability and budget are sent to the Gemini API to be parsed. Under the [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (checked October 6, 2026), on the **free (unpaid) tier** Google may use prompts and responses to provide, improve and develop its products, and human reviewers may read and annotate them after they are disconnected from the account. Google also asks users not to submit sensitive, confidential or personal information to unpaid services. On paid tiers, prompts are not used to improve products. **Implications for Midway:**
  - Treat the free tier as suitable for demos and test data, not real users' personal details. The sample group uses fictional people.
  - Before real use, either move to a paid tier or strip names before sending. Names aren't needed for parsing, and removing them is a small change in `lib/parser/prompt.ts`.
  - Mock mode (`MIDWAY_USE_MOCKS=true`) sends nothing to Gemini.
- **OpenStreetMap services (Nominatim, Overpass, OSRM).** These are public, community-run servers operated by volunteers and sponsors. They receive *place strings* (the parsed anchors, such as "Fort Wayne, Indiana") and *coordinates* (member locations and candidate points), but not names, schedules or budgets. Requests identify the app through `APP_USER_AGENT` as the usage policies require. The servers may log requests under their own privacy policies. A precise address such as a home address will reach Nominatim, so users should be told to enter a town or landmark unless an exact address matters.
- **Map tiles.** The user's browser loads tiles directly from `tile.openstreetmap.org`, which reveals the map area being viewed (the group's region) and the user's IP address to the OSM tile servers.

## Accuracy of AI-parsed input

The AI parser interprets free-form input, so it could misread a location, availability or budget and produce a misleading recommendation.

*Current state: the confirmation step is implemented.* After parsing, `/review` shows each member's original text next to Midway's interpretation, including the actual place names the geocoder resolved, not just the AI's reading. Medium and low confidence entries are highlighted, and warnings are shown prominently. Users can edit and re-check a location, or edit availability and budget directly. Meeting spots are only computed after the user clicks "Looks right, find meeting spots", and that button stays disabled while any member has no resolved location.

Supporting safeguards in the parser:

- The system instruction tells the model to extract only, leave unknowns empty rather than guess, and report uncertainty through `confidence` and `warnings`.
- Member text is passed as delimited data, and the model is told to ignore instructions inside it (prompt-injection resistance). The id, name and raw text are copied from the original input after the model responds, so the model can't change them.
- Every response is validated with zod. Invalid entries fall back to the raw text with low confidence, instead of being silently "fixed".

## Fairness and transparency of candidates

Candidate generation includes a **minimax** seed, which minimizes the longest trip anyone has to make, alongside total-distance seeds. The results page says which strategy produced each candidate. It also states that candidates are **not ranked** yet and that drive times are free-flow estimates without traffic, so users don't read more into the list than it supports. Ranking and scoring (Checkpoint #3) will need the same transparency about weights and trade-offs.
