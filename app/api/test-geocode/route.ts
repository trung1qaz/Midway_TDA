// TEMPORARY: proves the Google Maps Geocoding API key and request pipeline
// work end-to-end. Not wired into the UI. Remove once real geocoding logic
// (dynamic addresses, error handling for ambiguous input, etc.) lands.

const TEST_ADDRESS = "DePauw University, Greencastle, IN";

export async function GET() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "GOOGLE_MAPS_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", TEST_ADDRESS);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== "OK") {
    return Response.json(
      { error: data.status, details: data.error_message ?? null },
      { status: 502 }
    );
  }

  const { lat, lng } = data.results[0].geometry.location;

  return Response.json({
    address: TEST_ADDRESS,
    lat,
    lng,
  });
}
