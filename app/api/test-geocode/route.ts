// TEMPORARY: proves the geocoding request pipeline works end-to-end.
// Not wired into the UI. Remove once real geocoding logic (dynamic
// addresses, error handling for ambiguous input, etc.) lands.
//
// Uses OSM Nominatim: free, no API key/billing required. Their usage
// policy requires a descriptive User-Agent identifying the app and a
// contact, plus a 1 request/sec rate limit -- fine for this one-off
// test, but worth respecting once real geocoding traffic exists.

const TEST_ADDRESS = "DePauw University, Greencastle, IN";
const NOMINATIM_USER_AGENT =
  "Midway-Capstone/0.1 (contact: dam.t@northeastern.edu)";

export async function GET() {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", TEST_ADDRESS);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });
  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    return Response.json(
      { error: "No results found for address" },
      { status: 502 }
    );
  }

  const { lat, lon } = data[0];

  return Response.json({
    address: TEST_ADDRESS,
    lat: Number(lat),
    lng: Number(lon),
  });
}
