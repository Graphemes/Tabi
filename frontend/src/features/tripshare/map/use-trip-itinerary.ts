"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { orderRoute, pathLengthKm } from "@/lib/route-order";
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
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("place:new", invalidatePlaces);
      socket.off("place:updated", invalidatePlaces);
      socket.off("place:removed", invalidatePlaces);
      socket.off("location:update", invalidateLocations);
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

  // Visit order is computed, not the order things were added: source first, destination
  // last, stops arranged in between for the shortest path. See lib/route-order.ts.
  const itinerary = useMemo<ItineraryStop[]>(() => {
    const ordered = orderRoute({ source, destination, stops });
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
  }, [source, destination, stops]);

  /** How many stops sit between the two ends — the denominator in "stop 2 of 5". */
  const stopCount = useMemo(
    () => itinerary.filter((place) => place.role === "stop").length,
    [itinerary],
  );

  const route = useMemo<[number, number][]>(
    () => itinerary.map((place) => [place.longitude, place.latitude]),
    [itinerary],
  );

  const totalKm = useMemo(() => pathLengthKm(itinerary), [itinerary]);

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
        label: loc.user?.name || loc.user?.username || "Trip member",
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
    markers,
    totalKm,
    liveLocations,
    isPending: placesQuery.isPending || locationsQuery.isPending,
  };
}
