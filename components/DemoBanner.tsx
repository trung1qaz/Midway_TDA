export default function DemoBanner() {
  return (
    <p className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
      <strong>Mock mode:</strong> parsing, place lookups and drive times come from built-in fixture data
      (MIDWAY_USE_MOCKS=true), not Gemini, Nominatim or OSRM. Only a fixed list of Midwest places can be found.
    </p>
  );
}
