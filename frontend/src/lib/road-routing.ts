import { env } from "@/lib/env";
import type { RoutePoint } from "@/lib/route-order";

/**
 * Road distances and geometry from OSRM. Straight-line distance is a poor stand-in for
 * how long a leg actually takes — in hill country two towns 20 km apart on the map can
 * be 80 km apart by road — so visit order is solved on the road network, and the line
 * drawn on the map follows the roads rather than cutting across them.
 */

/** OSRM's default `/table` limit; bigger trips fall back to straight-line ordering. */
export const MAX_ROAD_POINTS = 100;

const REQUEST_TIMEOUT_MS = 12_000;

export type RoadMatrix = {
  /** Seconds, `[from][to]`, index-aligned with the input. Null where no road connects. */
  durations: (number | null)[][];
  /** Metres, same shape. */
  distances: (number | null)[][];
};

export type RoadPath = {
  /** [lng, lat] pairs along the roads, ready for a GeoJSON LineString. */
  coordinates: [number, number][];
  distanceMetres: number;
  durationSeconds: number;
};

const toCoordinateList = (points: RoutePoint[]) =>
  points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(";");

async function osrm<T>(path: string, signal?: AbortSignal): Promise<T> {
  // The caller's signal cancels superseded queries; the timeout stops a hung server
  // from leaving the route on its straight-line fallback indefinitely.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch(`${env.routingBaseUrl}${path}`, { signal: combined });
  const data = await response.json();
  if (!response.ok || data.code !== "Ok") {
    throw new Error(`Routing failed: ${data.message ?? data.code ?? response.status}`);
  }
  return data as T;
}

/** Driving time and distance between every pair of points. */
export async function fetchRoadMatrix(
  points: RoutePoint[],
  signal?: AbortSignal,
): Promise<RoadMatrix> {
  const data = await osrm<RoadMatrix>(
    `/table/v1/driving/${toCoordinateList(points)}?annotations=duration,distance`,
    signal,
  );
  return { durations: data.durations, distances: data.distances };
}

/** The road path through `points` in exactly the given order. */
export async function fetchRoadPath(
  points: RoutePoint[],
  signal?: AbortSignal,
): Promise<RoadPath> {
  const data = await osrm<{
    routes: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
    }>;
  }>(
    `/route/v1/driving/${toCoordinateList(points)}?overview=full&geometries=geojson`,
    signal,
  );

  const [route] = data.routes;
  return {
    coordinates: route.geometry.coordinates,
    distanceMetres: route.distance,
    durationSeconds: route.duration,
  };
}
