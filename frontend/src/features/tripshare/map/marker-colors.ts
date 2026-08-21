/**
 * Pin colours, kept out of `map-canvas.tsx` so the legend can import them without
 * pulling maplibre-gl into the main bundle — that module is `ssr: false` dynamic for a
 * reason. They're literal hex rather than design tokens because they're painted into
 * raw SVG strings and read over map tiles, not over app surfaces: the tiles don't
 * follow our palette, so these are chosen against the map instead.
 */
export const MARKER_COLORS = {
  source: "#0f7b46",
  destination: "#e5484d",
  stop: "#1f6f5c",
  member: "#3b6ef5",
  draft: "#8a8a8a",
} as const;

export type MarkerKind = keyof typeof MARKER_COLORS;
