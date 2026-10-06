// Server-side configuration, read from env at call time (not import time) so
// route handlers pick up .env.local and tests can override process.env.
// Never import this from a client component: it exposes GEMINI_API_KEY.

// Same identity the Checkpoint #1 geocoding test sent; override with
// APP_USER_AGENT. Nominatim and OSRM usage policies require a descriptive
// User-Agent with a contact.
export const DEFAULT_USER_AGENT =
  "Midway-Capstone/0.2 (student project; contact: dam.t@northeastern.edu)";

// "gemini-flash-latest" is the SDK's documented alias for the current Flash
// model. Pin a specific model via GEMINI_MODEL if behaviour must not drift.
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function mocksEnabled(): boolean {
  return env("MIDWAY_USE_MOCKS")?.toLowerCase() === "true";
}

export function serverConfig() {
  return {
    geminiApiKey: env("GEMINI_API_KEY"),
    geminiModel: env("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL,
    nominatimBaseUrl: stripTrailingSlash(
      env("NOMINATIM_BASE_URL") ?? "https://nominatim.openstreetmap.org"
    ),
    osrmBaseUrl: stripTrailingSlash(
      env("OSRM_BASE_URL") ?? "https://router.project-osrm.org"
    ),
    userAgent: env("APP_USER_AGENT") ?? DEFAULT_USER_AGENT,
    useMocks: mocksEnabled(),
  };
}
