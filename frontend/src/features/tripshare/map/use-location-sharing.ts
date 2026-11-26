"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { postLiveLocation, setLocationSharing, type ApiGroup } from "@/features/whatsapp/api";
import { toLivePosition } from "./use-location-broadcast";

/**
 * Geolocation only exists on secure origins. Opening the dev server from a phone by LAN
 * IP (http://192.168.x.x:3000) is not one, and the browser then fails every request with
 * an error that doesn't say why — so say it here.
 */
const INSECURE_ORIGIN_MESSAGE =
  "Location needs a secure connection — open the app over https (or on localhost).";

/**
 * The member's own privacy control for a trip: whether their position is visible to the
 * group at all, and pushing a fresh fix when it is. Shared by the Map tab and Trip info
 * so both switches read — and write — the same server-side flag. Continuous updates
 * while sharing is on come from `useLocationBroadcast`, mounted once in the app shell.
 */
export function useLocationSharing(
  group: ApiGroup | null,
  opts?: { onPosition?: (center: [number, number]) => void },
) {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((s) => s.user?.id);
  const [status, setStatus] = useState<string | null>(null);

  const groupId = group?.id ?? null;

  // The groups query includes every GroupMember scalar, so the persisted sharing flag is
  // already here — no extra request, and it survives a reload unlike local state would.
  const sharingEnabled = Boolean(
    group?.members.find((member) => member.userId === authUserId)?.locationSharingEnabled,
  );

  const shareMyLocation = () => {
    if (!groupId) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setStatus(INSECURE_ORIGIN_MESSAGE);
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        opts?.onPosition?.([pos.coords.longitude, pos.coords.latitude]);
        try {
          const result = await postLiveLocation(groupId, toLivePosition(pos.coords));
          setStatus(
            result.updated
              ? "Location shared with the trip."
              : "Turn on location sharing to show your position to the trip.",
          );
          queryClient.invalidateQueries({ queryKey: ["groups", groupId, "live-locations"] });
        } catch {
          setStatus("Couldn't reach the server — your location wasn't shared.");
        }
      },
      (err) => setStatus(err.message || "Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const toggleSharing = useMutation({
    mutationFn: (enabled: boolean) => setLocationSharing(groupId!, enabled),
    onSuccess: (_data, enabled) => {
      // Refetch groups so `locationSharingEnabled` — the source of truth for the switch,
      // and for which trips the app-wide broadcaster sends to — reflects the change.
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "live-locations"] });
      if (enabled) shareMyLocation();
      else setStatus("Location sharing is off for this trip.");
    },
    onError: () => setStatus("Couldn't change location sharing. Try again."),
  });

  return {
    sharingEnabled,
    setSharing: (enabled: boolean) => toggleSharing.mutate(enabled),
    isToggling: toggleSharing.isPending,
    shareMyLocation,
    status,
  };
}
