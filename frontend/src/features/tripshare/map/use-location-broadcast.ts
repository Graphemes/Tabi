"use client";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { postLiveLocation, type ApiGroup, type LivePosition } from "@/features/whatsapp/api";

/**
 * A position is only worth broadcasting so often: the watch fires on every sensor
 * update, which on a moving phone is several times a second.
 */
const MIN_SEND_MS = 15_000;

/**
 * `watchPosition` only fires when the device moves, so someone sitting still would look
 * like they'd dropped off. Re-check this often so their "last seen" stays honest.
 */
const HEARTBEAT_MS = 60_000;

/**
 * Browsers report `NaN` heading (and sometimes speed) when the device is stationary, and
 * the API rejects non-numbers — so anything that isn't a real number is left out.
 */
export function toLivePosition(coords: GeolocationCoordinates): LivePosition {
  const finite = (value: number | null) =>
    value !== null && Number.isFinite(value) ? value : undefined;

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: finite(coords.accuracy),
    speed: finite(coords.speed),
    heading: finite(coords.heading),
  };
}

/**
 * Keeps this member's position flowing to every trip they're sharing with, for as long as
 * the app is open — not only while a map happens to be on screen, which is what left the
 * rest of the group looking at a position from whenever the map was last opened.
 * Mounted once, in the app shell; one geolocation watch covers all trips.
 */
export function useLocationBroadcast(groups: ApiGroup[]) {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((s) => s.user?.id);

  // A string, so the effect restarts only when the set of trips actually changes rather
  // than on every refetch of the groups list.
  const sharingKey = useMemo(
    () =>
      groups
        .filter((group) =>
          group.members.some(
            (member) => member.userId === authUserId && member.locationSharingEnabled,
          ),
        )
        .map((group) => group.id)
        .sort((a, b) => a - b)
        .join(","),
    [groups, authUserId],
  );

  useEffect(() => {
    if (!sharingKey || typeof navigator === "undefined" || !navigator.geolocation) return;
    const groupIds = sharingKey.split(",").map(Number);
    let lastSentAt = 0;
    let latest: GeolocationPosition | null = null;
    let deferred: number | null = null;

    // Throttled on the trailing edge: a fix that arrives inside the window is held and
    // sent when it closes. Dropping it instead would strand the group on a stale
    // position, because the watch won't fire again until the device moves again.
    const send = (pos: GeolocationPosition) => {
      latest = pos;
      const wait = lastSentAt + MIN_SEND_MS - Date.now();
      if (wait > 0) {
        deferred ??= window.setTimeout(() => {
          deferred = null;
          if (latest) send(latest);
        }, wait);
        return;
      }
      lastSentAt = Date.now();

      const position = toLivePosition(pos.coords);
      for (const groupId of groupIds) {
        postLiveLocation(groupId, position)
          .then(() =>
            // The server broadcasts to everyone else; this keeps our own map current
            // even if our socket happens to be reconnecting.
            queryClient.invalidateQueries({ queryKey: ["groups", groupId, "live-locations"] }),
          )
          // A dropped fix is replaced by the next one; nothing worth interrupting for.
          .catch(() => {});
      }
    };

    // Errors (permission denied, no fix) are surfaced by the explicit share controls.
    const ignore = () => {};
    const watchId = navigator.geolocation.watchPosition(send, ignore, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
    });

    const heartbeat = window.setInterval(() => {
      if (Date.now() - lastSentAt < HEARTBEAT_MS) return;
      navigator.geolocation.getCurrentPosition(send, ignore, {
        enableHighAccuracy: true,
        maximumAge: HEARTBEAT_MS,
        timeout: 20_000,
      });
    }, HEARTBEAT_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(heartbeat);
      if (deferred !== null) window.clearTimeout(deferred);
    };
  }, [sharingKey, queryClient]);
}
