"use client";

import { useState } from "react";
import { MapPin, Navigation, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScreenHeader } from "@/components/app/screen-header";
import { UserAvatar } from "@/components/app/user-avatar";
import { EmptyState } from "@/components/app/empty-state";
import type { ApiGroup } from "@/features/whatsapp/api";
import { useAuthStore } from "@/store/auth-store";
import { getSocket } from "@/lib/socket";

export function MapView({
  groups,
  onOpenProfile,
}: {
  groups: ApiGroup[];
  onOpenProfile: () => void;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [sharingFor, setSharingFor] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const share = (groupId: number) => {
    setSharingFor(groupId);
    setStatus(null);
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
        setSharingFor(null);
        setStatus("Location shared with the group.");
      },
      (err) => {
        setSharingFor(null);
        setStatus(err.message || "Couldn't get your location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Map" onOpenProfile={onOpenProfile} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-6">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
          {/* No map library is wired up yet — this is an honest placeholder rather than a
              grey box pretending to be a map. */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-card">
            <div className="relative flex h-52 items-center justify-center bg-brand-50 dark:bg-brand-100/30">
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.14]"
                style={{
                  backgroundImage:
                    "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
                  backgroundSize: "28px 28px",
                }}
              />
              <div className="relative flex flex-col items-center gap-2 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand-900 text-brand-50 shadow-raised">
                  <MapPin className="size-5" />
                </span>
                <p className="text-sm font-medium">Live map coming soon</p>
                <p className="max-w-[30ch] text-xs text-muted-foreground">
                  Location sharing works today — the visual map is still being built.
                </p>
              </div>
            </div>
          </div>

          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Share your location
            </h2>

            {groups.length === 0 ? (
              <EmptyState
                icon={Navigation}
                title="No trips yet"
                description="Create a trip first, then you can share your live location with everyone in it."
              />
            ) : (
              <ul className="space-y-2">
                {groups.map((group) => (
                  <li
                    key={group.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3 shadow-card"
                  >
                    <UserAvatar
                      name={group.name}
                      photoUrl={group.photoUrl}
                      seed={group.id}
                      size="md"
                      square
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{group.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.members.length}{" "}
                        {group.members.length === 1 ? "member" : "members"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => share(group.id)}
                      disabled={sharingFor === group.id}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-900 px-3 py-2 text-xs font-semibold text-brand-50",
                        "transition hover:bg-brand-800 disabled:opacity-60",
                      )}
                    >
                      {sharingFor === group.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Navigation className="size-3.5" />
                      )}
                      Share
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {status && (
              <p className="mt-3 px-1 text-xs text-muted-foreground" role="status">
                {status}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
