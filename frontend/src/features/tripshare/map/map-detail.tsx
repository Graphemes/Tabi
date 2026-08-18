"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Flag,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  PlayCircle,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { ScreenHeader } from "@/components/app/screen-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSocket } from "@/lib/socket";
import { googleMapsLink, isMapConfigured, type PlaceHit } from "@/lib/maptiler";
import { pathLengthKm, shortestPath } from "@/lib/route-order";
import { useAuthStore } from "@/store/auth-store";
import {
  deletePlace,
  listGroupPlaces,
  listLiveLocations,
  setLocationSharing,
  sharePlace,
  type ApiGroup,
} from "@/features/whatsapp/api";
import type { PlaceDraft } from "../navigation/nav-state";
import { PlaceSearch } from "./place-search";
import type { MapMarker } from "./map-canvas";

// maplibre-gl reads `window` at import time, so it must never run during prerender.
const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-brand-50 dark:bg-brand-100/30">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export function MapDetail({
  group,
  onBack,
  onSavePlace,
  onOpenChat,
}: {
  group: ApiGroup | null;
  onBack: () => void;
  onSavePlace: (groupId: number, draft: PlaceDraft) => void;
  onOpenChat: (groupId: number) => void;
}) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUserId = useAuthStore((s) => s.user?.id);

  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);
  /** Where the map is actually looking, so search results are biased to the visible area. */
  const [viewCenter, setViewCenter] = useState<[number, number] | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const groupId = group?.id ?? null;
  // The groups query includes every GroupMember scalar, so the persisted sharing flag is
  // already here — no extra request, and it survives a reload unlike local state would.
  const sharingEnabled = Boolean(
    group?.members.find((member) => member.userId === authUserId)?.locationSharingEnabled,
  );

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

    const invalidatePlaces = () =>
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "places"] });
    const invalidateLocations = () =>
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "live-locations"] });

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

  const startPlace = useMemo(
    () => places.find((place) => place.kind === "START") ?? null,
    [places],
  );

  // Visit order is computed, not the order things were added: shortest path across the
  // start, every destination and every stop. See lib/route-order.ts.
  const itinerary = useMemo(
    () =>
      shortestPath(startPlace, places),
    [places, startPlace],
  );

  const route = useMemo<[number, number][]>(
    () => itinerary.map((place) => [place.longitude, place.latitude]),
    [itinerary],
  );

  const routeKm = useMemo(() => pathLengthKm(itinerary), [itinerary]);

  const markers = useMemo<MapMarker[]>(() => {
    let stepCount = 0;
    const saved = itinerary.map<MapMarker>((place) => {
      const isStart = place.kind === "START";
      const isStop = place.kind === "STOP";
      if (!isStart && !isStop) stepCount += 1;
      return {
        id: `saved:${place.id}`,
        latitude: place.latitude,
        longitude: place.longitude,
        kind: isStart ? "start" : isStop ? "stop" : "destination",
        label: place.name,
        order: !isStart && !isStop ? stepCount : undefined,
      };
    });

    const members = liveLocations.map<MapMarker>((loc) => ({
      id: `member:${loc.userId}`,
      latitude: loc.latitude,
      longitude: loc.longitude,
      kind: "member",
      label: loc.user?.name || loc.user?.username || "Trip member",
    }));

    return draft
      ? [
          ...saved,
          ...members,
          {
            id: "draft",
            latitude: draft.latitude,
            longitude: draft.longitude,
            kind: "draft",
            label: draft.name || "New pin",
          },
        ]
      : [...saved, ...members];
  }, [itinerary, liveLocations, draft]);

  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null;

  // Mirrors the backend's duplicate rule (same provider POI, or within ~11m) so the
  // button reads "Already added" instead of the save failing with a 409.
  const draftDuplicate = useMemo(() => {
    if (!draft) return null;
    return (
      places.find(
        (place) =>
          (draft.externalId && place.externalId === draft.externalId) ||
          (Math.abs(place.latitude - draft.latitude) <= 0.0001 &&
            Math.abs(place.longitude - draft.longitude) <= 0.0001),
      ) ?? null
    );
  }, [draft, places]);

  const shareToChat = useMutation({
    mutationFn: (placeId: number) => sharePlace(groupId!, placeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "messages"] });
      setSelectedPlaceId(null);
      onOpenChat(groupId!);
    },
  });

  const removePlace = useMutation({
    mutationFn: (placeId: number) => deletePlace(groupId!, placeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "places"] });
      setSelectedPlaceId(null);
    },
  });

  const toggleSharing = useMutation({
    mutationFn: (enabled: boolean) => setLocationSharing(groupId!, enabled),
    onSuccess: (_data, enabled) => {
      // Refetch groups so `locationSharingEnabled` — the source of truth for the switch —
      // reflects the change instead of the switch snapping back.
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      if (enabled) shareMyLocation();
      else setShareStatus("Location sharing is off for this trip.");
    },
  });

  const shareMyLocation = () => {
    if (!groupId || !accessToken) return;
    setShareStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        getSocket(accessToken).emit("location:update", {
          groupId,
          payload: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        });
        setCenter([pos.coords.longitude, pos.coords.latitude]);
        setShareStatus("Location shared with the trip.");
        queryClient.invalidateQueries({ queryKey: ["groups", groupId, "live-locations"] });
      },
      (err) => setShareStatus(err.message || "Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const pickSearchHit = (hit: PlaceHit) => {
    setSelectedPlaceId(null);
    setDraft({
      latitude: hit.latitude,
      longitude: hit.longitude,
      name: hit.name,
      address: hit.address,
      externalId: hit.id,
    });
    setCenter([hit.longitude, hit.latitude]);
  };

  if (!group) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader title="Map" />
        <EmptyState
          icon={MapIcon}
          title="Pick a trip"
          description="Choose a trip to see its saved places and everyone's live location."
        />
      </div>
    );
  }

  if (!isMapConfigured()) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader title={group.name} subtitle="Map" onBack={onBack} />
        <EmptyState
          icon={MapIcon}
          title="Map isn't configured"
          description="Set NEXT_PUBLIC_MAPTILER_KEY in the frontend environment to enable the map and place search."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title={group.name}
        subtitle={`${places.length} saved ${places.length === 1 ? "place" : "places"}`}
        onBack={onBack}
        actions={
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Share location</span>
            <Switch
              checked={sharingEnabled}
              onCheckedChange={(next) => toggleSharing.mutate(next)}
              disabled={toggleSharing.isPending}
              aria-label="Share my location with this trip"
            />
          </label>
        }
      />

      <div className="relative min-h-0 flex-1">
        <MapCanvas
          markers={markers}
          route={route}
          center={center}
          onMapClick={(latitude, longitude) => {
            setSelectedPlaceId(null);
            setDraft({ latitude, longitude });
          }}
          onMarkerClick={(id) => {
            if (!id.startsWith("saved:")) return;
            setDraft(null);
            setSelectedPlaceId(Number(id.slice("saved:".length)));
          }}
          onViewCenterChange={setViewCenter}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 p-3">
          <PlaceSearch
            proximity={viewCenter ?? center}
            onPick={pickSearchHit}
            className="pointer-events-auto mx-auto w-full max-w-md"
          />
        </div>

        {draft && (
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3 shadow-card">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{draft.name || "Dropped pin"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {draft.address || `${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}`}
                </p>
              </div>
              {draftDuplicate ? (
                <span
                  title={`"${draftDuplicate.name}" is already saved to this trip`}
                  className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  Already added
                </span>
              ) : (
                <Button size="sm" onClick={() => onSavePlace(group.id, draft)}>
                  Save
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setDraft(null)}
                aria-label="Discard pin"
              >
                <X />
              </Button>
            </div>
          </div>
        )}

        {selectedPlace && (
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="mx-auto w-full max-w-md space-y-3 rounded-2xl border border-border bg-surface-raised p-3 shadow-card">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selectedPlace.name}</p>
                  {selectedPlace.address && (
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedPlace.address}
                    </p>
                  )}
                  {selectedPlace.note && (
                    <p className="mt-1 text-xs text-foreground">{selectedPlace.note}</p>
                  )}
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setSelectedPlaceId(null)}
                  aria-label="Close"
                >
                  <X />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => shareToChat.mutate(selectedPlace.id)}
                  disabled={shareToChat.isPending}
                >
                  {shareToChat.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  Send to chat
                </Button>
                <a
                  href={googleMapsLink(
                    selectedPlace.latitude,
                    selectedPlace.longitude,
                    selectedPlace.name,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLink />
                  Directions
                </a>
                {/* Saved places belong to the trip, not the person who pinned them, so
                    any member can remove one — same rule the backend enforces. */}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removePlace.mutate(selectedPlace.id)}
                  disabled={removePlace.isPending}
                >
                  {removePlace.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="max-h-56 shrink-0 overflow-y-auto border-t border-border bg-surface">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Route
            {itinerary.length > 1 && (
              <span className="ml-2 font-normal normal-case">
                {itinerary.length} stops · {routeKm.toFixed(0)} km
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={shareMyLocation}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 transition hover:opacity-80"
          >
            <Navigation className="size-3.5" />
            Update my location
          </button>
        </div>

        {shareStatus && (
          <p className="px-4 pb-1 text-xs text-muted-foreground" role="status">
            {shareStatus}
          </p>
        )}

        {itinerary.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">
            Search for a place or long-press the map to drop a pin, then save it here.
            Your first pin sets the trip&apos;s starting point.
          </p>
        ) : (
          // Listed in computed visit order, matching the numbers on the map.
          <ul className="space-y-1 p-2">
            {itinerary.map((place) => (
              <li key={place.id} className="group/place flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setSelectedPlaceId(place.id);
                    setCenter([place.longitude, place.latitude]);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-hover"
                >
                  {place.kind === "START" ? (
                    <span
                      title="Starting point"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                    >
                      <PlayCircle className="size-4" />
                    </span>
                  ) : place.kind === "STOP" ? (
                    <span
                      title="Stop"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"
                    >
                      <MapPin className="size-4" />
                    </span>
                  ) : (
                    <span
                      title="Destination"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                    >
                      <Flag className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{place.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {place.kind === "START"
                        ? "Starting point"
                        : place.kind === "STOP"
                          ? "Stop"
                          : "Destination"}
                      {(place.note || place.address) && ` · ${place.note || place.address}`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removePlace.mutate(place.id)}
                  disabled={removePlace.isPending}
                  aria-label={`Delete ${place.name}`}
                  title={`Delete ${place.name}`}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 disabled:opacity-40 group-hover/place:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
