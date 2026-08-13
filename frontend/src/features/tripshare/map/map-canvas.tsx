"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
// maplibre-gl v6 ships named exports only — there is no default export to import.
import {
  GeolocateControl,
  MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type MapMouseEvent,
  type MapTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@/lib/maptiler";

/**
 * MapLibre v6 builds its worker URL at runtime from a hardcoded filename:
 *   new URL("./maplibre-gl-worker.mjs", import.meta.url)
 * Turbopack emits that asset content-hashed (maplibre-gl-worker.<hash>.mjs), so the
 * literal name 404s, the worker never starts, and vector tiles are never parsed — the
 * map then paints only its background colour plus DOM markers, with no map data.
 *
 * Pointing it at a stable copy under public/maplibre/ fixes that. Both the worker and
 * the shared chunk it imports are copied there by the `sync:maplibre` npm script.
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  kind: "saved" | "member" | "draft";
  label: string;
};

/** Fallback view when we have neither saved places nor a live position: roughly world-centred. */
const FALLBACK_CENTER: [number, number] = [78.9629, 20.5937];
const LONG_PRESS_MS = 500;

const MARKER_COLORS: Record<MapMarker["kind"], string> = {
  saved: "#1f6f5c",
  member: "#3b6ef5",
  draft: "#8a8a8a",
};

/**
 * MapLibre wrapper. Must be loaded with `next/dynamic({ ssr: false })` — maplibre-gl
 * touches `window` at import time and throws during prerender otherwise.
 */
export function MapCanvas({
  markers,
  center,
  onMapClick,
  onMarkerClick,
  onViewCenterChange,
}: {
  markers: MapMarker[];
  /** [lng, lat] the map should fly to when it changes. */
  center?: [number, number] | null;
  onMapClick?: (latitude: number, longitude: number) => void;
  onMarkerClick?: (id: string) => void;
  /** [lng, lat] of wherever the user has panned to — used to bias place search. */
  onViewCenterChange?: (center: [number, number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());

  // `resolvedTheme` collapses "system" to the concrete light/dark actually rendering.
  const { resolvedTheme } = useTheme();
  const mapTheme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";
  const styleRef = useRef<"light" | "dark">(mapTheme);

  // Handlers live in refs so the map is created exactly once — re-creating it on every
  // parent render would reset zoom/pan on each keystroke in the search box.
  const clickRef = useRef(onMapClick);
  const markerClickRef = useRef(onMarkerClick);
  const viewCenterRef = useRef(onViewCenterChange);

  useEffect(() => {
    clickRef.current = onMapClick;
    markerClickRef.current = onMarkerClick;
    viewCenterRef.current = onViewCenterChange;
  }, [onMapClick, onMarkerClick, onViewCenterChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyleUrl(styleRef.current),
      center: FALLBACK_CENTER,
      zoom: 3,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );

    // MapLibre swallows style/tile failures by default — surface them, otherwise a bad
    // key or a blocked request looks identical to an empty map.
    map.on("error", (event) => {
      console.error("[MapCanvas] maplibre error:", event.error?.message ?? event);
    });

    map.on("moveend", () => {
      const { lng, lat } = map.getCenter();
      viewCenterRef.current?.([lng, lat]);
    });

    map.on("click", (event: MapMouseEvent) => {
      clickRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });

    // MapLibre has no long-press event, so synthesise one for touch devices — that's the
    // only way to drop a pin on mobile, where "click" fires on any tap.
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    map.on("touchstart", (event: MapTouchEvent) => {
      cancelPress();
      if (event.points.length !== 1) return;
      const { lat, lng } = event.lngLat;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        clickRef.current?.(lat, lng);
      }, LONG_PRESS_MS);
    });
    map.on("touchmove", cancelPress);
    map.on("touchend", cancelPress);
    map.on("touchcancel", cancelPress);

    // The map lives in a flex pane that changes size on window resize and on the
    // mobile→desktop pane switch. MapLibre sizes its WebGL viewport once at init and
    // does not track the container, so without this the canvas renders at a stale size.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    const markerEls = markersRef.current;
    return () => {
      cancelPress();
      observer.disconnect();
      markerEls.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Diff markers against what's already on the map rather than tearing every pin down
  // each render — a full rebuild makes the pins visibly flicker on every poll/refetch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const next = new Set(markers.map((marker) => marker.id));

    for (const [id, marker] of markersRef.current) {
      if (!next.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const marker of markers) {
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        existing.setLngLat([marker.longitude, marker.latitude]);
        existing.setPopup(new Popup({ offset: 24 }).setText(marker.label));
        continue;
      }

      const instance = new Marker({ color: MARKER_COLORS[marker.kind] })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(new Popup({ offset: 24 }).setText(marker.label))
        .addTo(map);

      instance.getElement().addEventListener("click", (event) => {
        // Otherwise the click falls through to the map and drops a draft pin on top
        // of the marker the user was trying to open.
        event.stopPropagation();
        markerClickRef.current?.(marker.id);
      });

      markersRef.current.set(marker.id, instance);
    }
  }, [markers]);

  useEffect(() => {
    if (!center || !mapRef.current) return;
    mapRef.current.flyTo({ center, zoom: 14, essential: true });
  }, [center]);

  // Swap tiles when the app theme changes. `setStyle` keeps camera position and leaves
  // Marker instances alone (they're DOM overlays, not style layers), so pins survive.
  useEffect(() => {
    if (styleRef.current === mapTheme) return;
    styleRef.current = mapTheme;
    mapRef.current?.setStyle(mapStyleUrl(mapTheme));
  }, [mapTheme]);

  return <div ref={containerRef} className="size-full" />;
}
