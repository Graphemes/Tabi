"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
// maplibre-gl v6 ships named exports only — there is no default export to import.
import {
  GeolocateControl,
  LngLatBounds,
  type GeoJSONSource,
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
import { MARKER_COLORS, type MarkerKind } from "./marker-colors";

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
  kind: MarkerKind;
  label: string;
  /** 1-based position among the stops, shown inside stop pins. */
  order?: number;
};

/** Fallback view when we have neither saved places nor a live position: roughly world-centred. */
const FALLBACK_CENTER: [number, number] = [78.9629, 20.5937];
const LONG_PRESS_MS = 500;

/** Stable identity so a default-valued prop doesn't retrigger the route effect. */
const EMPTY_ROUTE: [number, number][] = [];

const ROUTE_SOURCE = "trip-route";
const ROUTE_COLOR = "#e5484d";

/**
 * Markers are plain DOM, so each kind gets its own shape rather than MapLibre's single
 * default pin. The three route roles have to be told apart at a glance, so they differ in
 * shape *and* colour, not just colour: the source is a green pennant on a pole, the
 * destination is a red teardrop carrying a chequered finish flag, and the stops between
 * them are small teal circles numbered in visit order. Members and drafts are plain dots.
 */
function buildMarkerElement(marker: MapMarker): HTMLElement {
  const el = document.createElement("div");
  const color = MARKER_COLORS[marker.kind];
  el.style.cursor = "pointer";
  el.title = marker.label;

  if (marker.kind === "source") {
    el.innerHTML = `
      <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="30" r="4.5" fill="${color}" stroke="#fff" stroke-width="2"/>
        <path d="M9 29V5" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M9 5h15l-4 5.5 4 5.5H9z" fill="${color}" stroke="#fff" stroke-width="2"
              stroke-linejoin="round"/>
      </svg>`;
    return el;
  }

  if (marker.kind === "destination") {
    // A flag rather than a number: the destination is the one pin whose meaning
    // shouldn't depend on reading a digit against a coloured background. A chequered
    // flag was the first try and turned to mush at pin size — this stays legible.
    el.innerHTML = `
      <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 41C16 41 29 25.4 29 15.5 29 7 23.2 1 16 1S3 7 3 15.5C3 25.4 16 41 16 41z"
              fill="${color}" stroke="#fff" stroke-width="2"/>
        <path d="M11 22V7" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M11.5 7.5h9l-2.5 4 2.5 4h-9z" fill="#fff"/>
      </svg>`;
    return el;
  }

  if (marker.kind === "stop") {
    el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9.5" fill="${color}" stroke="#fff" stroke-width="2.5"/>
        <text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700"
              font-family="system-ui, sans-serif" fill="#fff">${marker.order ?? ""}</text>
      </svg>`;
    return el;
  }

  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="6" fill="${color}" stroke="#fff" stroke-width="2.5"
              ${marker.kind === "draft" ? 'stroke-dasharray="3 2"' : ""}/>
    </svg>`;
  return el;
}

/**
 * MapLibre wrapper. Must be loaded with `next/dynamic({ ssr: false })` — maplibre-gl
 * touches `window` at import time and throws during prerender otherwise.
 */
export function MapCanvas({
  markers,
  route = EMPTY_ROUTE,
  center,
  onMapClick,
  onMarkerClick,
  onViewCenterChange,
}: {
  markers: MapMarker[];
  /** [lng, lat] pairs, in visit order, drawn as the trip route. */
  route?: [number, number][];
  /** [lng, lat] the map should fly to when it changes. */
  center?: [number, number] | null;
  onMapClick?: (latitude: number, longitude: number) => void;
  onMarkerClick?: (id: string) => void;
  /** [lng, lat] of wherever the user has panned to — used to bias place search. */
  onViewCenterChange?: (center: [number, number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, { marker: Marker; signature: string }>());

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

    // The icon is baked into the marker's DOM element, so a change of kind, order or
    // label can't be patched in place — it has to be rebuilt. Position-only changes
    // still reuse the existing marker.
    const signature = (m: MapMarker) => `${m.kind}|${m.order ?? ""}|${m.label}`;
    const next = new Map(markers.map((marker) => [marker.id, marker]));

    for (const [id, entry] of markersRef.current) {
      const incoming = next.get(id);
      if (!incoming || entry.signature !== signature(incoming)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const marker of markers) {
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        existing.marker.setLngLat([marker.longitude, marker.latitude]);
        continue;
      }

      const instance = new Marker({ element: buildMarkerElement(marker) })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(new Popup({ offset: 24 }).setText(marker.label))
        .addTo(map);

      instance.getElement().addEventListener("click", (event) => {
        // Otherwise the click falls through to the map and drops a draft pin on top
        // of the marker the user was trying to open.
        event.stopPropagation();
        markerClickRef.current?.(marker.id);
      });

      markersRef.current.set(marker.id, {
        marker: instance,
        signature: signature(marker),
      });
    }
  }, [markers]);

  useEffect(() => {
    if (!center || !mapRef.current) return;
    mapRef.current.flyTo({ center, zoom: 14, essential: true });
  }, [center]);

  // Route line through the trip's places, in computed visit order.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: route.map((point) => [point[0], point[1]]),
      },
    };

    const draw = () => {
      const existing = map.getSource(ROUTE_SOURCE);
      if (existing) {
        (existing as GeoJSONSource).setData(geojson);
        return;
      }

      map.addSource(ROUTE_SOURCE, { type: "geojson", data: geojson });
      // Casing underneath keeps the line readable over both light and dark tiles.
      map.addLayer({
        id: `${ROUTE_SOURCE}-casing`,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: `${ROUTE_SOURCE}-line`,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 3.5 },
      });
    };

    // `setStyle` (theme swap) discards custom sources and layers, so redraw on every
    // styledata event rather than only once.
    if (map.isStyleLoaded()) draw();
    map.on("styledata", draw);
    return () => {
      map.off("styledata", draw);
    };
  }, [route]);

  // First meaningful view: frame everything the trip has (saved places + members)
  // rather than opening on the whole world. Runs once, and only when the map has
  // finished loading — fitBounds before "load" is ignored.
  const framedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || framedRef.current || center || markers.length === 0) return;
    framedRef.current = true;

    const frame = () => {
      if (markers.length === 1) {
        map.jumpTo({ center: [markers[0].longitude, markers[0].latitude], zoom: 14 });
        return;
      }
      const bounds = new LngLatBounds();
      markers.forEach((m) => bounds.extend([m.longitude, m.latitude]));
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, animate: false });
    };

    if (map.isStyleLoaded()) frame();
    else map.once("load", frame);
  }, [markers, center]);

  // Nothing pinned yet: centre on the user instead of the world — but only if location
  // permission was already granted, so opening the map never triggers a cold prompt.
  useEffect(() => {
    if (framedRef.current || center || markers.length > 0) return;
    if (!navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition((pos) => {
          if (cancelled || framedRef.current) return;
          framedRef.current = true;
          mapRef.current?.jumpTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 13,
          });
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [markers.length, center]);

  // Swap tiles when the app theme changes. `setStyle` keeps camera position and leaves
  // Marker instances alone (they're DOM overlays, not style layers), so pins survive.
  useEffect(() => {
    if (styleRef.current === mapTheme) return;
    styleRef.current = mapTheme;
    mapRef.current?.setStyle(mapStyleUrl(mapTheme));
  }, [mapTheme]);

  return <div ref={containerRef} className="size-full" />;
}
