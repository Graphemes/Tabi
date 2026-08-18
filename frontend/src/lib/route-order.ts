/**
 * Orders trip waypoints into the shortest round-less path, anchored at the starting
 * point. This is the travelling-salesman problem, which is NP-hard, so we use the
 * standard heuristic pair: nearest-neighbour for an initial tour, then 2-opt to remove
 * the crossings nearest-neighbour always leaves behind. For the handful of stops a trip
 * realistically has, this reaches the optimal tour or very near it, instantly and
 * offline — no routing API, no key, no per-request cost.
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
 * remains. Index 0 is the fixed starting point and is never moved.
 */
function twoOpt<T extends RoutePoint>(path: T[]): T[] {
  if (path.length < 4) return path;

  const best = [...path];
  // Bounded so a pathological input can't spin: trips are small, and each pass is O(n²).
  const MAX_PASSES = 50;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let improved = false;

    for (let i = 1; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
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
 * Returns every point ordered for the shortest path, with `start` always first.
 * With no start point, the first element of `points` anchors the path instead, so the
 * route is still stable rather than arbitrary.
 */
export function shortestPath<T extends RoutePoint>(start: T | null, points: T[]): T[] {
  const anchor = start ?? points[0] ?? null;
  if (!anchor) return [];

  const rest = points.filter((point) => point.id !== anchor.id);
  if (rest.length === 0) return [anchor];

  return twoOpt([anchor, ...nearestNeighbour(anchor, rest)]);
}
