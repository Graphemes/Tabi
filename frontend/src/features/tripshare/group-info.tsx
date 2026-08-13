"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/app/user-avatar";
import { isMapConfigured } from "@/lib/maptiler";
import { useAuthStore } from "@/store/auth-store";
import {
  getGroup,
  listLiveLocations,
  updateGroup,
  type ApiGroup,
} from "@/features/whatsapp/api";
import type { MapMarker } from "./map/map-canvas";

// Same reason as the Map tab: maplibre-gl touches `window` at import time.
const MapCanvas = dynamic(() => import("./map/map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-brand-50 dark:bg-brand-100/30">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export function GroupInfo({
  group: fallbackGroup,
  onBack,
  onOpenMap,
}: {
  /** From the already-loaded `["groups"]` list, so the sheet paints instantly. */
  group: ApiGroup;
  onBack: () => void;
  onOpenMap: (groupId: number) => void;
}) {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((s) => s.user?.id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(fallbackGroup.name);
  const [description, setDescription] = useState(fallbackGroup.description ?? "");

  // Refetch the single group for fields the list endpoint doesn't carry (createdBy, roles).
  const groupQuery = useQuery({
    queryKey: ["groups", fallbackGroup.id, "detail"],
    queryFn: () => getGroup(fallbackGroup.id),
    initialData: fallbackGroup,
  });

  const group = groupQuery.data;

  const locationsQuery = useQuery({
    queryKey: ["groups", fallbackGroup.id, "live-locations"],
    queryFn: () => listLiveLocations(fallbackGroup.id),
  });

  const liveLocations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);

  const markers = useMemo<MapMarker[]>(
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

  const mapCenter = useMemo<[number, number] | null>(
    () =>
      liveLocations.length > 0
        ? [liveLocations[0].longitude, liveLocations[0].latitude]
        : null,
    [liveLocations],
  );

  const isAdmin =
    group.members.find((member) => member.userId === authUserId)?.role === "ADMIN";

  const saveDetails = useMutation({
    mutationFn: () =>
      updateGroup(group.id, {
        name: name.trim(),
        description: description.trim(),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["groups", group.id, "detail"], updated);
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setEditing(false);
    },
  });

  const cancelEdit = () => {
    setName(group.name);
    setDescription(group.description ?? "");
    setEditing(false);
  };

  const canSave = name.trim().length >= 2 && !saveDetails.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="flex-1 font-heading text-lg font-semibold tracking-tight">Trip info</h1>
        <button
          type="button"
          onClick={onBack}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center">
        <UserAvatar
          name={group.name}
          photoUrl={group.photoUrl}
          seed={group.id}
          size="xl"
          square
        />

        {editing ? (
          <div className="w-full space-y-3 text-left">
            <div className="space-y-1.5">
              <label htmlFor="group-name" className="text-xs font-medium text-muted-foreground">
                Trip name
              </label>
              <Input
                id="group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="group-desc" className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <Textarea
                id="group-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What's this trip about?"
                maxLength={500}
                rows={3}
              />
            </div>
            {saveDetails.isError && (
              <p className="text-xs text-destructive" role="alert">
                Couldn&apos;t save. Only trip admins can edit these details.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X />
                Cancel
              </Button>
              <Button size="sm" onClick={() => saveDetails.mutate()} disabled={!canSave}>
                {saveDetails.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-xl font-semibold tracking-tight">{group.name}</h2>
              <p className="text-xs text-muted-foreground">
                Trip · {group.members.length}{" "}
                {group.members.length === 1 ? "member" : "members"}
              </p>
            </div>

            <p
              className={cn(
                "max-w-[36ch] text-sm",
                group.description ? "text-foreground" : "text-muted-foreground italic",
              )}
            >
              {group.description || "No description yet."}
            </p>

            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil />
                Edit details
              </Button>
            )}
          </>
        )}
      </div>

      <section className="border-t border-border px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Live locations
          </h3>
          <button
            type="button"
            onClick={() => onOpenMap(group.id)}
            className="text-xs font-medium text-brand-700 transition hover:opacity-80"
          >
            View full map
          </button>
        </div>

        <div className="h-44 overflow-hidden rounded-2xl border border-border">
          {!isMapConfigured() ? (
            <div className="flex size-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
              Set NEXT_PUBLIC_MAPTILER_KEY to enable the map.
            </div>
          ) : locationsQuery.isPending ? (
            <div className="flex size-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : markers.length === 0 ? (
            <div className="flex size-full flex-col items-center justify-center gap-1.5 px-6 text-center">
              <Navigation className="size-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                No one is sharing their location yet.
              </p>
            </div>
          ) : (
            <MapCanvas markers={markers} center={mapCenter} />
          )}
        </div>
      </section>

      <section className="border-t border-border px-2 pt-4 pb-6">
        <h3 className="mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Users className="size-3.5" />
          {group.members.length} {group.members.length === 1 ? "member" : "members"}
        </h3>

        <ul>
          {group.members.map((member) => {
            const displayName =
              member.user?.name || member.user?.username || member.user?.phone || "Member";
            const isSharing = liveLocations.some((loc) => loc.userId === member.userId);

            return (
              <li
                key={member.userId}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5"
              >
                <UserAvatar name={displayName} seed={member.userId} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {displayName}
                    {member.userId === authUserId && (
                      <span className="text-muted-foreground"> (You)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.user?.phone || member.user?.email || "No contact details"}
                  </p>
                </div>
                {isSharing && (
                  <MapPin
                    className="size-3.5 shrink-0 text-brand-700"
                    aria-label="Sharing location"
                  />
                )}
                {/* Members added by an admin land as PENDING until they accept. */}
                {member.status && member.status !== "ACTIVE" && (
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {member.status.toLowerCase()}
                  </Badge>
                )}
                {member.role === "ADMIN" && (
                  <Badge variant="secondary" className="shrink-0">
                    Admin
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      </div>
    </div>
  );
}
