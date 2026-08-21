"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
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
import { isMapConfigured, type PlaceHit } from "@/lib/maptiler";
import { directionsLink, useNavPlatform } from "@/lib/navigation-link";
import { deletePlace, sharePlace, type ApiGroup } from "@/features/whatsapp/api";
import type { PlaceDraft } from "../navigation/nav-state";
import { PlaceSearch } from "./place-search";
import { useLocationSharing } from "./use-location-sharing";
import { roleLabel, useTripItinerary } from "./use-trip-itinerary";
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
  const navPlatform = useNavPlatform();

  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);
  /** Where the map is actually looking, so search results are biased to the visible area. */
  const [viewCenter, setViewCenter] = useState<[number, number] | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);

  const groupId = group?.id ?? null;

  const { places, itinerary, route, markers: tripMarkers, totalKm, stopCount } =
    useTripItinerary(groupId);
  const sharing = useLocationSharing(group, { onPosition: setCenter });

  // The unsaved pin is the only marker this screen owns; everything else comes from
  // the trip itself, so both maps stay in step.
  const markers = useMemo<MapMarker[]>(
    () =>
      draft
        ? [
            ...tripMarkers,
            {
              id: "draft",
              latitude: draft.latitude,
              longitude: draft.longitude,
              kind: "draft",
              label: draft.name || "New pin",
            },
          ]
        : tripMarkers,
    [tripMarkers, draft],
  );

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
              checked={sharing.sharingEnabled}
              onCheckedChange={sharing.setSharing}
              disabled={sharing.isToggling}
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
                  href={directionsLink(
                    selectedPlace.latitude,
                    selectedPlace.longitude,
                    selectedPlace.name,
                    navPlatform,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Navigation />
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
                {stopCount} {stopCount === 1 ? "stop" : "stops"} ·{" "}
                {totalKm.toFixed(0)} km
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={sharing.shareMyLocation}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 transition hover:opacity-80"
          >
            <Navigation className="size-3.5" />
            Update my location
          </button>
        </div>

        {sharing.status && (
          <p className="px-4 pb-1 text-xs text-muted-foreground" role="status">
            {sharing.status}
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
                  {/* Mirrors the pins: a flag at each end, a number for each stop. */}
                  {place.role === "source" ? (
                    <span
                      title="Source"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                    >
                      <PlayCircle className="size-4" />
                    </span>
                  ) : place.role === "destination" ? (
                    <span
                      title="Destination"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                    >
                      <Flag className="size-4" />
                    </span>
                  ) : (
                    <span
                      title="Stop"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
                    >
                      {place.stopNumber}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{place.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {roleLabel(place.role)}
                      {place.role === "stop" && ` ${place.stopNumber} of ${stopCount}`}
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
