"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPlace, type ApiGroup } from "@/features/whatsapp/api";
import type { PlaceDraft } from "../navigation/nav-state";

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
  const [name, setName] = useState(draft.name ?? "");
  const [note, setNote] = useState("");

  const savePlace = useMutation({
    mutationFn: () =>
      createPlace(group.id, {
        name: name.trim(),
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
          Couldn&apos;t save this place. Try again.
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
