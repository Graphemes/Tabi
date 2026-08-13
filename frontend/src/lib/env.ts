/**
 * Every `process.env.NEXT_PUBLIC_*` read below must be written out in full, as a literal
 * member expression. Next.js inlines these at build time by textual replacement, so a
 * dynamic lookup — `process.env[key]`, or destructuring `process.env` first — is NOT
 * replaced and silently yields `undefined` in the browser.
 * See node_modules/next/dist/docs/01-app/02-guides/environment-variables.md.
 */
const orFallback = (value: string | undefined, fallback: string) =>
  value && value.trim().length > 0 ? value : fallback;

export const env = {
  apiBaseUrl: orFallback(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:3001"),
  socketBaseUrl: orFallback(
    process.env.NEXT_PUBLIC_SOCKET_BASE_URL,
    "http://localhost:3001",
  ),
  /**
   * MapTiler serves both the vector tiles and the geocoding autocomplete. The key is
   * browser-visible by design — restrict it to our origins in the MapTiler dashboard.
   * Empty means the Map tab renders a "not configured" state instead of a broken canvas.
   */
  mapTilerKey: orFallback(process.env.NEXT_PUBLIC_MAPTILER_KEY, ""),
};
