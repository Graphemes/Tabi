"use client";

import { useSyncExternalStore } from "react";

/**
 * Directions deep links. Someone heading to a trip stop should land in the navigation
 * app they actually use, not a web page: Android's `geo:` scheme opens the system
 * chooser (Maps, Waze, Organic Maps, …), iOS gets Apple Maps' universal link, and
 * everything else falls back to Google Maps directions on the web — which still hands
 * off to the installed app when there is one.
 */

export type NavPlatform = "ios" | "android" | "web";

export function detectNavPlatform(userAgent: string): NavPlatform {
  if (/android/i.test(userAgent)) return "android";
  // iPadOS 13+ reports a Mac user agent, so iPads take the web fallback. That link
  // still opens Google Maps if it's installed, so it degrades rather than breaks.
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "web";
}

export function directionsLink(
  latitude: number,
  longitude: number,
  label?: string | null,
  platform: NavPlatform = "web",
): string {
  const coords = `${latitude},${longitude}`;
  const name = label ? encodeURIComponent(label) : "";

  if (platform === "android") {
    // `q=` keeps the destination pinned under its own name; with only the bare
    // coordinates some apps just recentre the map instead of setting a target.
    return `geo:${coords}?q=${coords}${name ? `(${name})` : ""}`;
  }

  if (platform === "ios") {
    return `https://maps.apple.com/?daddr=${coords}&dirflg=d${name ? `&q=${name}` : ""}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
}

/** The user agent never changes under us, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

/**
 * Reads the platform on the client only: `navigator` doesn't exist during prerender, and
 * guessing on the server would bake one platform's URL scheme into the HTML every client
 * then reuses. The server snapshot is the universal web link, so hydration matches.
 */
export function useNavPlatform(): NavPlatform {
  return useSyncExternalStore(
    noSubscribe,
    () => detectNavPlatform(navigator.userAgent),
    () => "web" as NavPlatform,
  );
}
