"use client";

import { cn } from "@/lib/utils";

/**
 * Two-pane container. Panes are hidden with `display`, never unmounted, so each screen
 * mounts exactly once — ChatView registers a global socket listener and AddExpense holds
 * a large form, both of which break under double-mounting or remount-on-resize.
 *
 * Order matters in the `cn()` calls below: tailwind-merge resolves conflicting `display`
 * utilities to the last one, so "flex … hidden … lg:flex" yields `hidden lg:flex`.
 * Reversing it would silently never hide.
 */
export function PaneGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
      {children}
    </div>
  );
}

export function ListPane({
  pane,
  className,
  children,
}: {
  pane: "list" | "detail";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // `relative` is load-bearing: FABs and dropdowns inside these screens position
    // against their pane, not the viewport.
    <section
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col lg:border-r lg:border-border",
        pane === "detail" && "hidden",
        "lg:flex",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function DetailPane({
  pane,
  className,
  children,
}: {
  pane: "list" | "detail";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col",
        pane === "list" && "hidden",
        "lg:flex",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Single wide pane. The screen constrains its own scroll content (see `contentWidth`
 * below) so headers can still span the full pane width on desktop.
 */
export function FullPane({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      {children}
    </section>
  );
}

/** Shared max-width for single-pane content, so cards don't stretch across a 1440px display. */
export const contentWidth = "mx-auto w-full lg:max-w-3xl";
