"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth-store";
import { setLocationSharing, type ApiGroup } from "@/features/whatsapp/api";

/**
 * A position is only worth broadcasting so often: the watch fires on every sensor
 * update, which on a moving phone is several times a second.
 */
const MIN_EMIT_MS = 15_000;

/**
 * One geolocation watch per trip, however many components mount this hook — the Map tab
 * and Trip info are both mounted at once on desktop, and two watches would mean double
 * the battery cost for the same fix.
 */
const watchers = new Map<
  number,
  { subscribers: number; watchId: number; lastEmitAt: number }
>();

/**
 * The member's own privacy control for a trip: whether their position is visible to the
 * group at all, and pushing a fresh fix when it is. Shared by the Map tab and Trip info
 * so both switches read — and write — the same server-side flag.
 */
export function useLocationSharing(
  group: ApiGroup | null,
  opts?: { onPosition?: (center: [number, number]) => void },
) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUserId = useAuthStore((s) => s.user?.id);
  const [status, setStatus] = useState<string | null>(null);

  const groupId = group?.id ?? null;

  // The groups query includes every GroupMember scalar, so the persisted sharing flag is
  // already here — no extra request, and it survives a reload unlike local state would.
  const sharingEnabled = Boolean(
    group?.members.find((member) => member.userId === authUserId)?.locationSharingEnabled,
  );

  const shareMyLocation = () => {
    if (!groupId || !accessToken) return;
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
        opts?.onPosition?.([pos.coords.longitude, pos.coords.latitude]);
        setStatus("Location shared with the trip.");
        queryClient.invalidateQueries({ queryKey: ["groups", groupId, "live-locations"] });
      },
      (err) => setStatus(err.message || "Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const toggleSharing = useMutation({
    mutationFn: (enabled: boolean) => setLocationSharing(groupId!, enabled),
    onSuccess: (_data, enabled) => {
      // Refetch groups so `locationSharingEnabled` — the source of truth for the switch —
      // reflects the change instead of the switch snapping back.
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "detail"] });
      if (enabled) shareMyLocation();
      else setStatus("Location sharing is off for this trip.");
    },
  });

  // While sharing is on, keep pushing fixes as the member moves — otherwise the group
  // sees wherever they were when they last opened the map, which is worse than useless
  // for "is anyone else near the next stop yet".
  useEffect(() => {
    if (!groupId || !accessToken || !sharingEnabled) return;
    if (!navigator.geolocation) return;

    const existing = watchers.get(groupId);
    if (existing) {
      existing.subscribers += 1;
    } else {
      const entry = { subscribers: 1, watchId: 0, lastEmitAt: 0 };
      entry.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - entry.lastEmitAt < MIN_EMIT_MS) return;
          entry.lastEmitAt = now;
          getSocket(accessToken).emit("location:update", {
            groupId,
            payload: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed ?? undefined,
              heading: pos.coords.heading ?? undefined,
            },
          });
        },
        // A denied or unavailable fix isn't worth interrupting the screen for; the
        // explicit "Update" button reports its own errors.
        () => {},
        { enableHighAccuracy: true, maximumAge: 10_000 },
      );
      watchers.set(groupId, entry);
    }

    return () => {
      const entry = watchers.get(groupId);
      if (!entry) return;
      entry.subscribers -= 1;
      if (entry.subscribers > 0) return;
      navigator.geolocation.clearWatch(entry.watchId);
      watchers.delete(groupId);
    };
  }, [groupId, accessToken, sharingEnabled]);

  return {
    sharingEnabled,
    setSharing: (enabled: boolean) => toggleSharing.mutate(enabled),
    isToggling: toggleSharing.isPending,
    shareMyLocation,
    status,
  };
}
