"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Flag, Loader2, MapPin, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createPlace,
  listGroupPlaces,
  type ApiGroup,
  type PlaceKind,
} from "@/features/whatsapp/api";
import type { PlaceDraft } from "../navigation/nav-state";

/** A trip runs source → stops → destination, so only the middle repeats. */
const KIND_OPTIONS = [
  {
    value: "START" as const,
    label: "Source",
    hint: "Where the trip begins",
    icon: PlayCircle,
  },
  {
    value: "DESTINATION" as const,
    label: "Destination",
    hint: "Where the trip ends",
    icon: Flag,
  },
  { value: "STOP" as const, label: "Stop", hint: "A waypoint on the way", icon: MapPin },
];

export function SavePlaceForm({
  group,
  draft,
  onBack,
}: {
  group: ApiGroup;
  draft: PlaceDraft;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();

  // Served from cache — the map screen already holds this query open.
  const placesQuery = useQuery({
    queryKey: ["groups", group.id, "places"],
    queryFn: () => listGroupPlaces(group.id),
  });

  const existingStart = useMemo(
    () => (placesQuery.data ?? []).find((place) => place.kind === "START") ?? null,
    [placesQuery.data],
  );

  const existingDestination = useMemo(
    () => (placesQuery.data ?? []).find((place) => place.kind === "DESTINATION") ?? null,
    [placesQuery.data],
  );

  const [name, setName] = useState(draft.name ?? "");
  const [note, setNote] = useState("");
  // The default walks the trip's own shape: the source first, then the destination, and
  // everything after that is a stop in between.
  const [kind, setKind] = useState<PlaceKind | null>(null);
  const effectiveKind: PlaceKind =
    kind ?? (!existingStart ? "START" : !existingDestination ? "DESTINATION" : "STOP");

  const takenBy = (value: PlaceKind) =>
    value === "START" ? existingStart
    : value === "DESTINATION" ? existingDestination
    : null;

  const savePlace = useMutation({
    mutationFn: () =>
      createPlace(group.id, {
        name: name.trim(),
        kind: effectiveKind,
        note: note.trim() || undefined,
        address: draft.address || undefined,
        latitude: draft.latitude,
        longitude: draft.longitude,
        externalId: draft.externalId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", group.id, "places"] });
      onBack();
    },
  });

  const canSave = name.trim().length > 0 && !savePlace.isPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) savePlace.mutate();
      }}
      className="space-y-4 p-1"
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 text-xs">
          {draft.address && <p className="text-foreground">{draft.address}</p>}
          <p className="text-muted-foreground">
            {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}
          </p>
        </div>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
          {existingStart ? "What is this place?" : "Start here — what is this place?"}
        </legend>
        {!existingStart && (
          <p className="mb-2 rounded-lg bg-brand-50 px-2.5 py-2 text-xs text-brand-800 dark:bg-brand-100/20 dark:text-brand-100">
            This trip has no source yet. The route is measured from it, so save this one
            as the source unless you have somewhere else in mind.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {KIND_OPTIONS.map((option) => {
            const active = effectiveKind === option.value;
            // Exactly one source and one destination per trip — the backend rejects a
            // second of either with a 409, so don't offer it.
            const claimedBy = takenBy(option.value);
            const taken = Boolean(claimedBy);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                disabled={taken}
                aria-pressed={active}
                title={
                  claimedBy
                    ? `"${claimedBy.name}" is already the ${option.value === "START" ? "source" : "destination"} for this trip`
                    : undefined
                }
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-left transition",
                  active
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-100/20"
                    : "border-border bg-surface hover:bg-surface-hover",
                  taken && "cursor-not-allowed opacity-50 hover:bg-surface",
                )}
              >
                <option.icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    active ? "text-brand-700" : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="place-name" className="text-xs font-medium text-muted-foreground">
          Name
        </label>
        <Input
          id="place-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Sunset viewpoint"
          maxLength={120}
          autoFocus
          className="h-10"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="place-note" className="text-xs font-medium text-muted-foreground">
          Note <span className="font-normal">(optional)</span>
        </label>
        <Textarea
          id="place-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Opens at 6am, book ahead…"
          maxLength={500}
          rows={3}
        />
      </div>

      {savePlace.isError && (
        <p className="text-xs text-destructive" role="alert">
          {/* 409 means another member pinned the same spot first — show the server's
              message rather than a generic retry prompt the user can't act on. */}
          {isAxiosError(savePlace.error) && savePlace.error.response?.status === 409
            ? ((savePlace.error.response.data as { message?: string })?.message ??
              "That place is already saved to this trip.")
            : "Couldn't save this place. Try again."}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={!canSave}>
          {savePlace.isPending && <Loader2 className="size-4 animate-spin" />}
          Save to {group.name}
        </Button>
      </div>
    </form>
  );
}
