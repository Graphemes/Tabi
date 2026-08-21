/**
 * Orders trip waypoints into the shortest path from the trip's source to its
 * destination, visiting every stop in between. Both ends are fixed by the user, so only
 * the middle is solved: that's the travelling-salesman path problem, which is NP-hard,
 * so we use the standard heuristic pair — nearest-neighbour for an initial tour, then
 * 2-opt to remove the crossings nearest-neighbour always leaves behind. For the handful
 * of stops a trip realistically has, this reaches the optimal tour or very near it,
 * instantly and offline — no routing API, no key, no per-request cost.
 *
 * Distances are great-circle (as the crow flies), not road distances. See
 * `map-detail.tsx` for how the result is drawn.
 */

export type RoutePoint = {
  /** Any stable identity — the solver only compares it, never parses it. */
  id: string | number;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_KM = 6371;
const toRadians = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function pathLengthKm(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversineKm(points[i - 1], points[i]);
  return total;
}

/** Greedy first pass: repeatedly hop to the closest place not yet visited. */
function nearestNeighbour<T extends RoutePoint>(start: T, rest: T[]): T[] {
  const remaining = [...rest];
  const tour: T[] = [];
  let current: T = start;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;

    remaining.forEach((candidate, index) => {
      const distance = haversineKm(current, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    current = remaining[bestIndex];
    tour.push(current);
    remaining.splice(bestIndex, 1);
  }

  return tour;
}

/**
 * 2-opt: reverse any segment whose removal shortens the path, until no improvement
 * remains. Index 0 is the source and is never moved; with `fixedEnd` the final point is
 * the destination and is pinned too, so only the stops between them are reordered.
 */
function twoOpt<T extends RoutePoint>(path: T[], fixedEnd: boolean): T[] {
  if (path.length < 4) return path;

  const best = [...path];
  // Bounded so a pathological input can't spin: trips are small, and each pass is O(n²).
  const MAX_PASSES = 50;
  const lastMovable = fixedEnd ? best.length - 2 : best.length - 1;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let improved = false;

    for (let i = 1; i < lastMovable; i += 1) {
      for (let k = i + 1; k <= lastMovable; k += 1) {
        const before =
          haversineKm(best[i - 1], best[i]) +
          (k + 1 < best.length ? haversineKm(best[k], best[k + 1]) : 0);
        const after =
          haversineKm(best[i - 1], best[k]) +
          (k + 1 < best.length ? haversineKm(best[i], best[k + 1]) : 0);

        // 1e-9 guards against float noise flipping the same pair back and forth forever.
        if (after < before - 1e-9) {
          best.splice(i, k - i + 1, ...best.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

/**
 * Orders a trip: source first, destination last, stops arranged in between for the
 * shortest total distance.
 *
 * Either end may be missing while the trip is still being planned. Without a source the
 * first stop anchors the path, so the route is stable rather than arbitrary; without a
 * destination the path simply ends wherever the last stop is.
 */
export function orderRoute<T extends RoutePoint>({
  source,
  destination,
  stops,
}: {
  source: T | null;
  destination: T | null;
  stops: T[];
}): T[] {
  const anchor = source ?? stops[0] ?? destination ?? null;
  if (!anchor) return [];

  const middle = stops.filter(
    (stop) => stop.id !== anchor.id && stop.id !== destination?.id,
  );

  const ordered = [anchor, ...nearestNeighbour(anchor, middle)];
  const fixedEnd = Boolean(destination) && destination!.id !== anchor.id;
  if (fixedEnd) ordered.push(destination!);

  return twoOpt(ordered, fixedEnd);
}
