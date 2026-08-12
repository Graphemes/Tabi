"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Plus, Archive, RotateCcw, Compass, MapPin, Image as ImageIcon, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/app/user-avatar";
import { EmptyState } from "@/components/app/empty-state";
import { ScreenHeader } from "@/components/app/screen-header";
import { ApiGroup, ApiMessage, updateMemberStatus } from "@/features/whatsapp/api";
import { contentWidth } from "./layout/pane-group";
import { useAuthStore } from "@/store/auth-store";
import type { FilterChip } from "./types";

const FILTERS: FilterChip[] = ["All Trips", "Active", "Pending", "Archived"];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Real preview text from the group's newest message — replaces the old literal "Name: ...". */
function previewOf(message: ApiMessage | null | undefined, selfId?: number) {
  if (!message) return null;
  const who =
    message.senderId === selfId
      ? "You"
      : message.sender?.name || message.sender?.username || "Someone";
  if (message.type === "LOCATION") return { who, body: "shared a location", icon: MapPin };
  if (message.type === "IMAGE") return { who, body: "sent a photo", icon: ImageIcon };
  if (message.expense) return { who, body: `paid ${Number(message.expense.totalAmount).toLocaleString()} ${message.expense.currency} · ${message.expense.title}`, icon: Receipt };
  return { who, body: message.content ?? "", icon: null };
}

type Props = {
  groups: ApiGroup[];
  isLoading?: boolean;
  selectedGroupId?: number | null;
  onSelectGroup: (id: number) => void;
  onNewTrip: () => void;
  onOpenProfile: () => void;
  /** "compact" is the chat tab's list pane: no filter chips, tighter rows. */
  variant?: "full" | "compact";
};

export function MyTrips({
  groups,
  isLoading = false,
  selectedGroupId = null,
  onSelectGroup,
  onNewTrip,
  onOpenProfile,
  variant = "full",
}: Props) {
  const authUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterChip>("All Trips");
  const compact = variant === "compact";

  const updateStatusMutation = useMutation({
    mutationFn: ({ groupId, status }: { groupId: number; status: "ACTIVE" | "ARCHIVED" }) =>
      updateMemberStatus(groupId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  const filtered = useMemo(() => {
    let result = groups;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((g) => g.name.toLowerCase().includes(q));
    }
    if (activeFilter !== "All Trips") {
      const statusMap: Record<FilterChip, string> = {
        "All Trips": "",
        Active: "ACTIVE",
        Pending: "PENDING",
        Archived: "ARCHIVED",
      };
      const target = statusMap[activeFilter];
      result = result.filter((g) =>
        g.members.some((m) => m.userId === authUser?.id && m.status === target),
      );
    }
    return result.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [groups, search, activeFilter, authUser?.id]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title={compact ? "Chats" : "Trips"}
        subtitle={
          !compact && groups.length > 0
            ? `${groups.length} ${groups.length === 1 ? "trip" : "trips"}`
            : undefined
        }
        onOpenProfile={onOpenProfile}
      />

      <div className={cn("flex flex-col gap-3 px-4 pt-3", contentWidth, compact ? "pb-2" : "pb-3")}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trips"
            className="h-10 w-full rounded-xl border border-border bg-surface-raised pr-3 pl-10 text-sm shadow-card transition placeholder:text-muted-foreground focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
          />
        </div>

        {!compact && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((chip) => {
              const active = activeFilter === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setActiveFilter(chip)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-brand-900 text-brand-50 shadow-card"
                      : "bg-surface-raised text-muted-foreground ring-1 ring-border hover:text-foreground",
                  )}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-24 md:pb-6", contentWidth)}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3"
              >
                <Skeleton className="size-12 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Compass}
            title={search ? "No matching trips" : "No trips yet"}
            description={
              search
                ? "Try a different name."
                : "Create a trip to start planning, chatting and splitting costs together."
            }
            action={
              !search && (
                <Button onClick={onNewTrip} size="lg">
                  <Plus className="size-4" />
                  Create a trip
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((group) => {
              const myMembership = group.members.find((m) => m.userId === authUser?.id);
              const isArchived = myMembership?.status === "ARCHIVED";
              const selected = selectedGroupId === group.id;
              const preview = previewOf(group.lastMessage, authUser?.id);
              const PreviewIcon = preview?.icon;

              return (
                <li key={group.id} className="group/row relative">
                  <button
                    type="button"
                    onClick={() => onSelectGroup(group.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                      selected
                        ? "border-brand-300 bg-brand-50 shadow-card dark:bg-brand-100/40"
                        : "border-border bg-surface-raised shadow-card hover:border-brand-200 hover:bg-surface-hover",
                    )}
                  >
                    <UserAvatar
                      name={group.name}
                      photoUrl={group.photoUrl}
                      seed={group.id}
                      size={compact ? "md" : "lg"}
                      square
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold">{group.name}</h3>
                        <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                          {timeAgo(group.lastMessage?.createdAt ?? group.updatedAt)}
                        </span>
                      </div>

                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {preview ? (
                          <>
                            {PreviewIcon && <PreviewIcon className="size-3 shrink-0" />}
                            <span className="truncate">
                              <span className="font-medium text-foreground/70">
                                {preview.who}:
                              </span>{" "}
                              {preview.body}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground/70">No messages yet</span>
                        )}
                      </p>

                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <Users className="size-3" />
                          {group.members.length}
                        </span>
                        {isArchived && (
                          <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        groupId: group.id,
                        status: isArchived ? "ACTIVE" : "ARCHIVED",
                      })
                    }
                    title={isArchived ? "Unarchive" : "Archive"}
                    className="absolute top-2 right-2 rounded-lg bg-surface-raised/90 p-1.5 text-muted-foreground opacity-0 shadow-card transition hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
                  >
                    {isArchived ? (
                      <RotateCcw className="size-3.5" />
                    ) : (
                      <Archive className="size-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Mobile-only: desktop has the sidebar's "New trip" button. */}
      <button
        type="button"
        onClick={onNewTrip}
        aria-label="New trip"
        className="absolute right-5 bottom-5 flex size-13 items-center justify-center rounded-2xl bg-accent-500 text-white shadow-raised transition hover:bg-accent-600 active:scale-95 md:hidden"
      >
        <Plus className="size-6" />
      </button>
    </div>
  );
}
