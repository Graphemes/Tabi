"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Flag, Loader2, Navigation, PlayCircle, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isMapConfigured } from "@/lib/maptiler";
import { directionsLink, useNavPlatform } from "@/lib/navigation-link";
import type { ApiGroup } from "@/features/whatsapp/api";
import { MARKER_COLORS } from "./marker-colors";
import { useLocationSharing } from "./use-location-sharing";
import { roleLabel, useTripItinerary, type ItineraryStop } from "./use-trip-itinerary";

// Same reason as the Map tab: maplibre-gl touches `window` at import time.
const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-brand-50 dark:bg-brand-100/30">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

/** Mirrors the map pins: flag at each end of the route, a number for each stop between. */
function StopIcon({ stop }: { stop: ItineraryStop }) {
  if (stop.role === "source") {
    return (
      <span
        title="Source"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
      >
        <PlayCircle className="size-4" />
      </span>
    );
  }

  if (stop.role === "destination") {
    return (
      <span
        title="Destination"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
      >
        <Flag className="size-4" />
      </span>
    );
  }

  return (
    <span
      title="Stop"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
    >
      {stop.stopNumber}
    </span>
  );
}

/**
 * The trip's journey, as shown inside Trip info: the whole route on one map — start,
 * stops, destinations and everyone currently sharing their location — plus the same
 * sequence as a list you can tap through for details and turn-by-turn hand-off.
 */
export function ItinerarySection({
  group,
  onOpenMap,
}: {
  group: ApiGroup;
  onOpenMap: (groupId: number) => void;
}) {
  const { itinerary, route, markers, totalKm, liveLocations, stopCount, isPending } =
    useTripItinerary(group.id);
  const navPlatform = useNavPlatform();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);

  const sharing = useLocationSharing(group, { onPosition: setCenter });

  const selected = useMemo(
    () => itinerary.find((stop) => stop.id === selectedId) ?? null,
    [itinerary, selectedId],
  );

  const selectStop = (stop: ItineraryStop) => {
    // Tapping the open row again closes it, but keeps the map where it was.
    if (stop.id === selectedId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(stop.id);
    setCenter([stop.longitude, stop.latitude]);
  };

  return (
    <section className="border-t border-border px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Route className="size-3.5" />
          Itinerary
        </h3>
        <button
          type="button"
          onClick={() => onOpenMap(group.id)}
          className="text-xs font-medium text-brand-700 transition hover:opacity-80"
        >
          View full map
        </button>
      </div>

      <div className="h-52 overflow-hidden rounded-2xl border border-border">
        {!isMapConfigured() ? (
          <div className="flex size-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            Set NEXT_PUBLIC_MAPTILER_KEY to enable the map.
          </div>
        ) : isPending ? (
          <div className="flex size-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : markers.length === 0 ? (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 px-6 text-center">
            <Navigation className="size-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              No route yet, and no one is sharing their location.
            </p>
          </div>
        ) : (
          <MapCanvas
            markers={markers}
            route={route}
            center={center}
            onMarkerClick={(id) => {
              if (!id.startsWith("saved:")) return;
              setSelectedId(Number(id.slice("saved:".length)));
            }}
          />
        )}
      </div>

      {itinerary.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: MARKER_COLORS.source }}
              aria-hidden
            />
            Source
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: MARKER_COLORS.stop }}
              aria-hidden
            />
            Stops (numbered)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: MARKER_COLORS.destination }}
              aria-hidden
            />
            Destination
          </span>
          {liveLocations.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: MARKER_COLORS.member }}
              aria-hidden
            />
              Members
            </span>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {itinerary.length > 0 ? (
          <>
            {stopCount} {stopCount === 1 ? "stop" : "stops"} in between
            {itinerary.length > 1 && <> · {totalKm.toFixed(0)} km end to end</>}
          </>
        ) : (
          "No places saved yet."
        )}
        {liveLocations.length > 0 && (
          <> · {liveLocations.length} sharing live location</>
        )}
      </p>

      {/* Sharing is opt-in per trip: nobody's position reaches the map above until the
          member turns this on, and turning it off stops the updates immediately. */}
      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
        <label
          htmlFor={`share-location-${group.id}`}
          className="min-w-0 flex-1 text-xs text-muted-foreground"
        >
          <span className="block text-sm font-medium text-foreground">
            Share my live location
          </span>
          Visible to everyone on this trip while it&apos;s on.
        </label>
        {sharing.sharingEnabled && (
          <button
            type="button"
            onClick={sharing.shareMyLocation}
            className="shrink-0 text-xs font-medium text-brand-700 transition hover:opacity-80"
          >
            Update
          </button>
        )}
        <Switch
          id={`share-location-${group.id}`}
          checked={sharing.sharingEnabled}
          onCheckedChange={sharing.setSharing}
          disabled={sharing.isToggling}
          aria-label="Share my location with this trip"
        />
      </div>

      {sharing.status && (
        <p className="mt-1 text-xs text-muted-foreground" role="status">
          {sharing.status}
        </p>
      )}

      {itinerary.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Open the full map to search for a place or drop a pin. The first one saved
          becomes the trip&apos;s starting point.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {itinerary.map((stop) => {
            const isSelected = stop.id === selectedId;

            return (
              <li key={stop.id}>
                <button
                  type="button"
                  onClick={() => selectStop(stop)}
                  aria-expanded={isSelected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-surface-hover",
                    isSelected && "bg-surface-hover",
                  )}
                >
                  <StopIcon stop={stop} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{stop.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {roleLabel(stop.role)}
                      {stop.role === "stop" && ` ${stop.stopNumber} of ${stopCount}`}
                    </span>
                  </span>
                </button>

                {isSelected && selected && (
                  <div className="mt-1 mb-2 ml-11 space-y-2 rounded-xl border border-border bg-surface-raised p-3">
                    {selected.address && (
                      <p className="text-xs text-foreground">{selected.address}</p>
                    )}
                    {selected.note && (
                      <p className="text-xs text-muted-foreground">{selected.note}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                      {selected.createdBy && (
                        <>
                          {" · added by "}
                          {selected.createdBy.name ||
                            selected.createdBy.username ||
                            "a member"}
                        </>
                      )}
                    </p>
                    <a
                      href={directionsLink(
                        selected.latitude,
                        selected.longitude,
                        selected.name,
                        navPlatform,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Navigation />
                      Directions
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
