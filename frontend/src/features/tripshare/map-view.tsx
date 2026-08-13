"use client";

import { MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScreenHeader } from "@/components/app/screen-header";
import { UserAvatar } from "@/components/app/user-avatar";
import { EmptyState } from "@/components/app/empty-state";
import type { ApiGroup } from "@/features/whatsapp/api";

/**
 * List pane of the Map tab: pick which trip's map to open. The map itself lives in
 * `map/map-detail.tsx` so the heavy MapLibre bundle only loads once a trip is chosen.
 */
export function MapView({
  groups,
  selectedGroupId,
  onSelectTrip,
  onOpenProfile,
}: {
  groups: ApiGroup[];
  selectedGroupId: number | null;
  onSelectTrip: (groupId: number) => void;
  onOpenProfile: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Map" onOpenProfile={onOpenProfile} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-6">
        {groups.length === 0 ? (
          <EmptyState
            icon={Navigation}
            title="No trips yet"
            description="Create a trip first, then you can save places and share your live location with everyone in it."
          />
        ) : (
          <ul className="space-y-2 p-3">
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => onSelectTrip(group.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3 text-left shadow-card transition",
                    "hover:bg-surface-hover",
                    selectedGroupId === group.id && "border-brand-300 bg-surface-hover",
                  )}
                >
                  <UserAvatar
                    name={group.name}
                    photoUrl={group.photoUrl}
                    seed={group.id}
                    size="md"
                    square
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{group.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {group.members.length}{" "}
                      {group.members.length === 1 ? "member" : "members"}
                    </span>
                  </span>
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
