"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { haversineKm, orderRoute, pathLengthKm } from "@/lib/route-order";
import { fetchRoadMatrix, fetchRoadPath, MAX_ROAD_POINTS } from "@/lib/road-routing";
import { useAuthStore } from "@/store/auth-store";
import {
  listGroupPlaces,
  listLiveLocations,
  type ApiSavedPlace,
} from "@/features/whatsapp/api";
import type { MapMarker } from "./map-canvas";

/**
 * One source of truth for "what does this trip's journey look like" — the ordered
 * itinerary, the line joining it, the pins, and where everyone currently is. Both the
 * Map tab and the Itinerary section of Trip info render from this, so the two can't
 * disagree about visit order or numbering.
 */

/**
 * What a place *is* on the route, as opposed to what it was saved as. A trip has one
 * source and one destination; everything else is a stop, including the extra
 * DESTINATION rows a trip may still carry from before that rule was enforced.
 */
export type StopRole = "source" | "stop" | "destination";

export type ItineraryStop = ApiSavedPlace & {
  role: StopRole;
  /** 1-based position along the whole route, source included. */
  position: number;
  /** 1-based position among the stops in between — null for the two endpoints. */
  stopNumber: number | null;
};

/**
 * Positions are pushed over the socket as they arrive; this poll only covers a socket
 * that's mid-reconnect, so the map can never sit on a stale position for long.
 */
const LIVE_LOCATION_POLL_MS = 30_000;

/** Average road speed for estimating a leg OSRM has no road for (islands, ferries). */
const FALLBACK_KMH = 30;

export function roleLabel(role: StopRole): string {
  if (role === "source") return "Source";
  if (role === "destination") return "Destination";
  return "Stop";
}

export function useTripItinerary(groupId: number | null) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  const placesQuery = useQuery({
    queryKey: ["groups", groupId, "places"],
    queryFn: () => listGroupPlaces(groupId!),
    enabled: Boolean(groupId),
  });

  const locationsQuery = useQuery({
    queryKey: ["groups", groupId, "live-locations"],
    queryFn: () => listLiveLocations(groupId!),
    enabled: Boolean(groupId),
    refetchInterval: LIVE_LOCATION_POLL_MS,
  });

  const places = useMemo(() => placesQuery.data ?? [], [placesQuery.data]);
  const liveLocations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);

  // Other members' saves and position updates land over the socket; refetch rather than
  // patching the cache by hand so the payload shape stays owned by the API layer.
  useEffect(() => {
    if (!accessToken || !groupId) return;
    const socket = getSocket(accessToken);

    // The socket carries every group the member belongs to, so events for other trips
    // arrive here too — refetching on those would be pure noise.
    const isThisTrip = (event: { groupId?: number } | undefined) =>
      event?.groupId === undefined || event.groupId === groupId;

    const invalidatePlaces = (event?: { groupId?: number }) => {
      if (!isThisTrip(event)) return;
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "places"] });
    };
    const invalidateLocations = (event?: { groupId?: number }) => {
      if (!isThisTrip(event)) return;
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "live-locations"] });
    };

    socket.on("place:new", invalidatePlaces);
    socket.on("place:updated", invalidatePlaces);
    socket.on("place:removed", invalidatePlaces);
    socket.on("location:update", invalidateLocations);
    // Someone turning sharing off must vanish from everyone's map, and turning it on
    // appear, without waiting for the next poll.
    socket.on("location:sharing", invalidateLocations);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("place:new", invalidatePlaces);
      socket.off("place:updated", invalidatePlaces);
      socket.off("place:removed", invalidatePlaces);
      socket.off("location:update", invalidateLocations);
      socket.off("location:sharing", invalidateLocations);
    };
  }, [accessToken, groupId, queryClient]);

  const { source, destination, stops } = useMemo(() => {
    const found = places.find((place) => place.kind === "START") ?? null;
    // Oldest wins if a trip predates the one-destination rule, so adding places can't
    // silently repoint where the trip is heading. The rest fall back to stops.
    const destinations = places
      .filter((place) => place.kind === "DESTINATION")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const end = destinations[0] ?? null;

    return {
      source: found,
      destination: end,
      stops: places.filter((place) => place.id !== found?.id && place.id !== end?.id),
    };
  }, [places]);

  // Every point on the route, in a stable order, so the matrix query's key only changes
  // when a place is added, removed or moved.
  const routePoints = useMemo(
    () =>
      [source, destination, ...stops]
        .filter((place): place is ApiSavedPlace => place !== null)
        .sort((a, b) => a.id - b.id),
    [source, destination, stops],
  );

  const canUseRoads = routePoints.length <= MAX_ROAD_POINTS;
  const matrixQuery = useQuery({
    queryKey: ["road-matrix", pointsKey(routePoints)],
    queryFn: ({ signal }) => fetchRoadMatrix(routePoints, signal),
    // With two points there is nothing to order, so no matrix is needed.
    enabled: routePoints.length >= 3 && canUseRoads,
    staleTime: Infinity,
    retry: 1,
  });

  // Visit order is computed, not the order things were added: source first, destination
  // last, stops arranged in between for the shortest *driving time*. Until the road
  // matrix arrives (or if the routing server is down) great-circle distance stands in.
  // See lib/route-order.ts.
  const itinerary = useMemo<ItineraryStop[]>(() => {
    const matrix = matrixQuery.data;
    const indexOf = new Map(routePoints.map((place, index) => [place.id, index]));
    const cost = matrix
      ? (a: ApiSavedPlace, b: ApiSavedPlace) =>
          matrix.durations[indexOf.get(a.id)!]?.[indexOf.get(b.id)!] ??
          (haversineKm(a, b) / FALLBACK_KMH) * 3600
      : haversineKm;

    const ordered = orderRoute({ source, destination, stops }, cost);
    const roleOf = (id: number): StopRole =>
      id === source?.id ? "source" : id === destination?.id ? "destination" : "stop";

    // Stop numbers count only the stops, so "stop 2 of 5" doesn't include the two ends.
    const stopIds = ordered
      .filter((place) => roleOf(place.id) === "stop")
      .map((place) => place.id);

    return ordered.map((place, index) => {
      const role = roleOf(place.id);
      return {
        ...place,
        role,
        position: index + 1,
        stopNumber: role === "stop" ? stopIds.indexOf(place.id) + 1 : null,
      };
    });
  }, [source, destination, stops, routePoints, matrixQuery.data]);

  /** How many stops sit between the two ends — the denominator in "stop 2 of 5". */
  const stopCount = useMemo(
    () => itinerary.filter((place) => place.role === "stop").length,
    [itinerary],
  );

  // The line on the map follows the roads. Fetched only once the order has settled on
  // road times, so the provisional straight-line order never costs a request.
  const pathQuery = useQuery({
    queryKey: ["road-path", pointsKey(itinerary)],
    queryFn: ({ signal }) => fetchRoadPath(itinerary, signal),
    enabled: itinerary.length >= 2 && canUseRoads && !matrixQuery.isFetching,
    staleTime: Infinity,
    retry: 1,
  });
  const roadPath = pathQuery.data ?? null;

  const straightLine = useMemo<[number, number][]>(
    () => itinerary.map((place) => [place.longitude, place.latitude]),
    [itinerary],
  );
  const route = roadPath?.coordinates ?? straightLine;

  /** "road" once the drawn line and totals come from the road network. */
  const routeKind: "road" | "straight" = roadPath ? "road" : "straight";
  const totalKm = useMemo(
    () => (roadPath ? roadPath.distanceMetres / 1000 : pathLengthKm(itinerary)),
    [roadPath, itinerary],
  );
  const totalMinutes = roadPath ? roadPath.durationSeconds / 60 : null;

  const placeMarkers = useMemo<MapMarker[]>(
    () =>
      itinerary.map((place) => ({
        id: `saved:${place.id}`,
        latitude: place.latitude,
        longitude: place.longitude,
        // Both ends of the route carry a flag; only the stops in between are numbered.
        kind: place.role,
        label: place.name,
        order: place.stopNumber ?? undefined,
      })),
    [itinerary],
  );

  const memberMarkers = useMemo<MapMarker[]>(
    () =>
      liveLocations.map((loc) => ({
        id: `member:${loc.userId}`,
        latitude: loc.latitude,
        longitude: loc.longitude,
        kind: "member",
        // Same fallback as the Trip info member list, so a member who hasn't set a name
        // yet is still told apart by phone instead of every pin reading "Trip member".
        label: `${loc.user?.name || loc.user?.username || loc.user?.phone || "Trip member"} · ${timeAgo(loc.sharedAt)}`,
      })),
    [liveLocations],
  );

  const markers = useMemo<MapMarker[]>(
    () => [...placeMarkers, ...memberMarkers],
    [placeMarkers, memberMarkers],
  );

  return {
    places,
    itinerary,
    source,
    destination,
    stopCount,
    route,
    routeKind,
    markers,
    totalKm,
    totalMinutes,
    liveLocations,
    isPending: placesQuery.isPending || locationsQuery.isPending,
  };
}

/** Identity *and* position, so moving a pin refetches but a refetch alone doesn't. */
function pointsKey(points: ApiSavedPlace[]): string {
  return points
    .map((p) => `${p.id}:${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`)
    .join("|");
}

/** "just now", "4 min ago", "2 h ago" — how fresh a member's position is. */
function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** "45 min", "3 h 20 min" — driving time for the whole route. */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
