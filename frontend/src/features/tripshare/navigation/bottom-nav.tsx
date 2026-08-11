"use client";

import { cn } from "@/lib/utils";
import type { TabId } from "../types";
import { TABS } from "./tab-config";

/** Mobile only — the sidebar takes over from `md` up. */
export function BottomNav({
  tab,
  onSelectTab,
}: {
  tab: TabId;
  onSelectTab: (tab: TabId) => void;
}) {
  return (
    <nav className="flex shrink-0 items-stretch justify-around border-t border-border bg-surface-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelectTab(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              active ? "text-brand-700" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-0 h-0.5 w-8 rounded-full transition-all",
                active ? "bg-accent-500 opacity-100" : "opacity-0",
              )}
            />
            <Icon
              className={cn("size-5 transition-transform", active && "scale-110")}
              strokeWidth={active ? 2.4 : 2}
            />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
