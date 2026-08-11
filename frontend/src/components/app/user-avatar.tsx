"use client";

import { cn } from "@/lib/utils";

/** Deterministic tint per user so avatars stay stable across renders and screens. */
const TINTS = [
  "bg-brand-100 text-brand-800",
  "bg-accent-100 text-accent-700",
  "bg-chart-5/15 text-chart-5",
  "bg-positive-soft text-positive",
  "bg-warning-soft text-warning",
] as const;

export function initialsOf(name: string | null | undefined, fallback = "?") {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(/\s+/);
  const letters =
    parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
} as const;

export function UserAvatar({
  name,
  photoUrl,
  seed,
  size = "md",
  square = false,
  className,
}: {
  name?: string | null;
  photoUrl?: string | null;
  /** Stable id (user/group id) used to pick the tint; falls back to the name. */
  seed?: number | string;
  size?: keyof typeof SIZES;
  square?: boolean;
  className?: string;
}) {
  const key = String(seed ?? name ?? "");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const tint = TINTS[hash % TINTS.length];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold select-none",
        square ? "rounded-xl" : "rounded-full",
        SIZES[size],
        photoUrl ? "bg-muted" : tint,
        className,
      )}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user content, arbitrary origin
        <img src={photoUrl} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
