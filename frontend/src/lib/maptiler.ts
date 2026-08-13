import { env } from "./env";

/**
 * MapTiler client. Deliberately uses bare `fetch` rather than the shared axios
 * instance in `lib/http.ts` — that one attaches our Bearer token to every request,
 * which must never leave for a third-party host.
 */

const GEOCODE_BASE = "https://api.maptiler.com/geocoding";

export const isMapConfigured = () => env.mapTilerKey.length > 0;

/** Map tiles follow the app theme, so a dark UI doesn't frame a bright white map. */
export const mapStyleUrl = (theme: "light" | "dark" = "light") =>
  `https://api.maptiler.com/maps/streets-v2${theme === "dark" ? "-dark" : ""}/style.json?key=${env.mapTilerKey}`;

export type PlaceHit = {
  id: string;
  /** Short display name, e.g. "Anjuna Beach". */
  name: string;
  /** Fuller context line, e.g. "Anjuna, Goa, India". */
  address: string;
  latitude: number;
  longitude: number;
};

type GeocodeFeature = {
  id?: string;
  text?: string;
  place_name?: string;
  center?: [number, number];
  geometry?: { coordinates?: [number, number] };
};

export async function geocode(
  query: string,
  opts?: { proximity?: [number, number]; signal?: AbortSignal },
): Promise<PlaceHit[]> {
  if (!isMapConfigured() || query.trim().length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    key: env.mapTilerKey,
    autocomplete: "true",
    limit: "8",
    // Without an explicit `types` list the API answers almost entirely with addresses
    // and administrative places, and buries POIs — searching a real landmark returned
    // same-named towns on other continents. `poi` first is what surfaces malls, cafés,
    // markets and other businesses.
    types: "poi,address,place,municipality,neighbourhood,region",
  });

  if (opts?.proximity) {
    const [lng, lat] = opts.proximity;
    params.set("proximity", `${lng},${lat}`);
  }

  const url = `${GEOCODE_BASE}/${encodeURIComponent(query.trim())}.json?${params}`;
  const res = await fetch(url, { signal: opts?.signal });

  if (!res.ok) {
    throw new Error(`Place search failed (${res.status})`);
  }

  const data = (await res.json()) as { features?: GeocodeFeature[] };

  return (data.features ?? []).flatMap((feature, index) => {
    const coords = feature.center ?? feature.geometry?.coordinates;
    // A feature without coordinates can't be pinned, so drop it rather than
    // rendering a result that does nothing when tapped.
    if (!coords) return [];

    const [longitude, latitude] = coords;
    const placeName = feature.place_name ?? feature.text ?? "";
    const name = feature.text ?? placeName;

    return [
      {
        id: feature.id ?? `${latitude},${longitude},${index}`,
        name,
        // Strip the leading name so the secondary line isn't "X, X, Goa, India".
        address:
          placeName.startsWith(`${name}, `) ?
            placeName.slice(name.length + 2)
          : placeName,
        latitude,
        longitude,
      },
    ];
  });
}

/** Same shape the backend produces in `LocationService.buildMapsDeepLink`. */
export const googleMapsLink = (lat: number, lng: number, label?: string) =>
  label ?
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}%20(${encodeURIComponent(label)})`
  : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
