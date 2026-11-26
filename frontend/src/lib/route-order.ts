/**
 * Orders trip waypoints into the cheapest path from the trip's source to its
 * destination, visiting every stop in between. Both ends are fixed by the user, so only
 * the middle is solved: the travelling-salesman path problem.
 *
 * For the stop counts a trip realistically has, it is solved *exactly* with Held–Karp
 * dynamic programming — O(n²·2ⁿ), a few milliseconds at the 12-stop limit. Larger trips
 * fall back to nearest-neighbour plus local search (2-opt reversal and single-stop
 * relocation), which is near-optimal but not guaranteed.
 *
 * The cost is pluggable: `use-trip-itinerary.ts` passes road driving times from
 * `lib/road-routing.ts`, falling back to great-circle distance here when the routing
 * server can't be reached. Costs may be asymmetric (one-way streets), and every move is
 * scored on the whole path, so nothing assumes A→B equals B→A.
 */

export type RoutePoint = {
  /** Any stable identity — the solver only compares it, never parses it. */
  id: string | number;
  latitude: number;
  longitude: number;
};

export type RouteCost<T extends RoutePoint> = (from: T, to: T) => number;

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

/** Above this many stops, the exact solver's 2ⁿ table gets too big to run per render. */
const EXACT_STOP_LIMIT = 12;

/** Ignores improvements smaller than float noise, so moves can't flip back and forth. */
const EPSILON = 1e-9;

type Problem<T extends RoutePoint> = {
  start: T | null;
  end: T | null;
  stops: T[];
  cost: RouteCost<T>;
};

/** Cost of start → stops (in this order) → end; a missing end is free. */
function pathCost<T extends RoutePoint>(
  { start, end, cost }: Problem<T>,
  order: T[],
): number {
  if (order.length === 0) return start && end ? cost(start, end) : 0;
  let total = start ? cost(start, order[0]) : 0;
  for (let i = 1; i < order.length; i += 1) total += cost(order[i - 1], order[i]);
  if (end) total += cost(order[order.length - 1], end);
  return total;
}

/**
 * Held–Karp: `best[mask][j]` is the cheapest way to visit exactly the stops in `mask`,
 * finishing at stop j. Without a source the path may begin at any stop, and without a
 * destination it may finish at any — both handled by a zero entry/exit cost.
 */
function solveExact<T extends RoutePoint>(problem: Problem<T>): T[] {
  const { start, end, stops, cost } = problem;
  const n = stops.length;
  const subsets = 1 << n;
  const full = subsets - 1;

  const legs = stops.map((from) => stops.map((to) => cost(from, to)));
  const best = new Float64Array(subsets * n).fill(Infinity);
  const previous = new Int8Array(subsets * n).fill(-1);

  for (let j = 0; j < n; j += 1) {
    best[(1 << j) * n + j] = start ? cost(start, stops[j]) : 0;
  }

  for (let mask = 1; mask <= full; mask += 1) {
    for (let j = 0; j < n; j += 1) {
      if (!(mask & (1 << j))) continue;
      const here = best[mask * n + j];
      if (here === Infinity) continue;

      for (let k = 0; k < n; k += 1) {
        if (mask & (1 << k)) continue;
        const next = mask | (1 << k);
        const candidate = here + legs[j][k];
        if (candidate < best[next * n + k]) {
          best[next * n + k] = candidate;
          previous[next * n + k] = j;
        }
      }
    }
  }

  let last = -1;
  let bestTotal = Infinity;
  for (let j = 0; j < n; j += 1) {
    const total = best[full * n + j] + (end ? cost(stops[j], end) : 0);
    if (total < bestTotal) {
      bestTotal = total;
      last = j;
    }
  }

  // Only reachable if every cost was infinite; any order is then as good as another.
  if (last === -1) return stops;

  const order: T[] = [];
  let mask = full;
  while (last !== -1) {
    order.push(stops[last]);
    const before = previous[mask * n + last];
    mask &= ~(1 << last);
    last = before;
  }
  return order.reverse();
}

/** Greedy seed: repeatedly hop to the cheapest stop not yet visited. */
function nearestNeighbour<T extends RoutePoint>(
  from: T,
  rest: T[],
  cost: RouteCost<T>,
): T[] {
  const remaining = [...rest];
  const tour: T[] = [];
  let current = from;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestCost = Infinity;
    remaining.forEach((candidate, index) => {
      const c = cost(current, candidate);
      if (c < bestCost) {
        bestCost = c;
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
 * Local search from a greedy seed: keep applying the first segment reversal (2-opt) or
 * single-stop move (or-opt) that shortens the whole path, until neither does.
 */
function solveHeuristic<T extends RoutePoint>(problem: Problem<T>): T[] {
  const { start, stops, cost } = problem;

  // Without a source, try every stop as the first one and keep the best seed.
  const seeds = start
    ? [nearestNeighbour(start, stops, cost)]
    : stops.map((first) => [
        first,
        ...nearestNeighbour(
          first,
          stops.filter((stop) => stop !== first),
          cost,
        ),
      ]);

  let order = seeds[0];
  let orderCost = pathCost(problem, order);
  for (const seed of seeds.slice(1)) {
    const c = pathCost(problem, seed);
    if (c < orderCost) {
      order = seed;
      orderCost = c;
    }
  }

  const tryCandidate = (candidate: T[]) => {
    const c = pathCost(problem, candidate);
    if (c < orderCost - EPSILON) {
      order = candidate;
      orderCost = c;
      return true;
    }
    return false;
  };

  // Bounded so a pathological input can't spin; each pass is O(n³).
  const MAX_PASSES = 50;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let improved = false;

    for (let i = 0; i < order.length - 1; i += 1) {
      for (let k = i + 1; k < order.length; k += 1) {
        const reversed = [
          ...order.slice(0, i),
          ...order.slice(i, k + 1).reverse(),
          ...order.slice(k + 1),
        ];
        if (tryCandidate(reversed)) improved = true;
      }
    }

    for (let i = 0; i < order.length; i += 1) {
      for (let j = 0; j < order.length; j += 1) {
        if (i === j) continue;
        const moved = [...order];
        const [stop] = moved.splice(i, 1);
        moved.splice(j, 0, stop);
        if (tryCandidate(moved)) improved = true;
      }
    }

    if (!improved) break;
  }

  return order;
}

/**
 * Orders a trip: source first, destination last, stops arranged in between for the
 * lowest total cost (great-circle kilometres unless a cost is given).
 *
 * Either end may be missing while the trip is still being planned. Without a source the
 * path starts at whichever stop makes it cheapest; without a destination it ends at
 * whichever stop makes it cheapest.
 */
export function orderRoute<T extends RoutePoint>(
  {
    source,
    destination,
    stops,
  }: {
    source: T | null;
    destination: T | null;
    stops: T[];
  },
  cost: RouteCost<T> = haversineKm,
): T[] {
  const start = source;
  const end = destination && destination.id !== source?.id ? destination : null;
  const middle = stops.filter((stop) => stop.id !== start?.id && stop.id !== end?.id);

  const problem: Problem<T> = { start, end, stops: middle, cost };
  const ordered =
    middle.length <= 1
      ? middle
      : middle.length <= EXACT_STOP_LIMIT
        ? solveExact(problem)
        : solveHeuristic(problem);

  return [...(start ? [start] : []), ...ordered, ...(end ? [end] : [])];
}
