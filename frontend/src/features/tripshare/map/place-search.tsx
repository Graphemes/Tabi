"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { geocode, type PlaceHit } from "@/lib/maptiler";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

export function PlaceSearch({
  proximity,
  onPick,
  className,
}: {
  /** [lng, lat] to bias results towards what the user is currently looking at. */
  proximity?: [number, number] | null;
  onPick: (hit: PlaceHit) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debounced.length >= MIN_QUERY_LENGTH;

  // Proximity materially changes the ranking, so it belongs in the cache key — but at
  // full precision every pixel of panning would be a new key. One decimal (~11km) keeps
  // the cache useful while still re-querying when the user moves to a different area.
  const proximityKey = proximity
    ? `${proximity[0].toFixed(1)},${proximity[1].toFixed(1)}`
    : "none";

  const { data, isFetching, isError } = useQuery({
    queryKey: ["geocode", debounced, proximityKey],
    queryFn: ({ signal }) => geocode(debounced, { proximity: proximity ?? undefined, signal }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const results = enabled ? (data ?? []) : [];
  const showPanel = open && enabled;

  const pick = (hit: PlaceHit) => {
    onPick(hit);
    setQuery(hit.name);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for a place"
          aria-label="Search for a place"
          // Sits on top of the map, so it needs an opaque background and a real border —
          // the default translucent input disappeared against the tiles.
          className="h-11 rounded-xl border-border bg-surface-raised pr-9 pl-9 text-foreground shadow-overlay ring-1 ring-black/5 dark:bg-surface-raised dark:ring-white/10"
        />
        {isFetching ?
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        : query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(false);
              }}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )
        }
      </div>

      {showPanel && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface-raised py-1 shadow-overlay">
          {isError ?
            <li className="px-3 py-2.5 text-xs text-muted-foreground">
              Couldn&apos;t reach the search service. Try again.
            </li>
          : results.length === 0 ?
            <li className="px-3 py-2.5 text-xs text-muted-foreground">
              {isFetching ? "Searching…" : "No places found."}
            </li>
          : results.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => pick(hit)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-surface-hover"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{hit.name}</span>
                    {hit.address && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {hit.address}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))
          }
        </ul>
      )}
    </div>
  );
}
