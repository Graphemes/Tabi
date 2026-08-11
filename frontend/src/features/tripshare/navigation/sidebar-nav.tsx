"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/app/user-avatar";
import type { TabId } from "../types";
import { TABS } from "./tab-config";

type Props = {
  tab: TabId;
  onSelectTab: (tab: TabId) => void;
  onNewTrip: () => void;
  onOpenProfile: () => void;
  user: { id: number; name?: string | null; username?: string | null; email?: string | null; phone?: string | null } | null;
};

/**
 * Icon rail from `md`, widening to a labelled sidebar at `xl`. Nav flips at `md` while
 * panes flip at `lg` — two panes need ~872px, but a bottom tab bar is already wrong on a
 * landscape tablet.
 */
export function SidebarNav({ tab, onSelectTab, onNewTrip, onOpenProfile, user }: Props) {
  const displayName = user?.name || user?.username || user?.email || user?.phone || "Account";

  return (
    <aside className="hidden shrink-0 flex-col border-r border-border bg-sidebar md:flex md:w-[76px] xl:w-60">
      <div className="flex h-16 items-center gap-2.5 px-4 xl:px-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-900 text-sm font-bold text-brand-50">
          T
        </div>
        <span className="hidden font-heading text-lg font-semibold tracking-tight text-foreground xl:block">
          Tabi
        </span>
      </div>

      <div className="px-3 pb-2 xl:px-4">
        <button
          type="button"
          onClick={onNewTrip}
          title="New trip"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 py-2.5 text-sm font-semibold text-white",
            "shadow-card transition hover:bg-accent-600 active:scale-[0.98]",
          )}
        >
          <Plus className="size-4.5" />
          <span className="hidden xl:block">New trip</span>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2 xl:px-4">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              title={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                "justify-center xl:justify-start",
                active
                  ? "bg-brand-100 text-brand-800"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
              <span className="hidden xl:block">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 xl:p-4">
        <button
          type="button"
          onClick={onOpenProfile}
          title={displayName}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-hover",
            "justify-center xl:justify-start",
          )}
        >
          <UserAvatar name={displayName} seed={user?.id} size="sm" />
          <span className="hidden min-w-0 flex-1 xl:block">
            <span className="block truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">View profile</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
