"use client";

import { useMemo, useState } from "react";
import { Search, MapPin, Users, Plus, Archive, RotateCcw } from "lucide-react";
import { ApiGroup, updateMemberStatus } from "@/features/whatsapp/api";
import { useAuthStore } from "@/store/auth-store";
import type { FilterChip } from "./types";

const FILTERS: FilterChip[] = ["All Trips", "Active", "Pending", "Archived"];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

type Props = {
  groups: ApiGroup[];
  onSelectGroup: (id: number) => void;
  onFabClick: () => void;
};

export function MyTrips({ groups, onSelectGroup, onFabClick }: Props) {
  const authUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterChip>("All Trips");

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
      const targetStatus = statusMap[activeFilter];
      result = result.filter((g) =>
        g.members.some(
          (m) => m.userId === authUser?.id && m.status === targetStatus,
        ),
      );
    }
    return result.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [groups, search, activeFilter, authUser?.id]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-4 px-4 pb-4 pt-2">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trips or groups..."
            className="w-full rounded-xl border-0 bg-white py-3.5 pl-10 pr-4 text-sm text-[#0B1C30] shadow-sm ring-1 ring-[#E2E8F0] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((chip) => {
            const active = activeFilter === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => setActiveFilter(chip)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold tracking-[0.05em] transition ${
                  active
                    ? "bg-[#003535] text-white shadow-md"
                    : "bg-[#DCE9FF] text-[#404848] hover:bg-[#c8d8f5]"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {filtered.map((group) => {
          const myMembership = group.members.find((m) => m.userId === authUser?.id);
          const isArchived = myMembership?.status === "ARCHIVED";
          return (
            <div key={group.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelectGroup(group.id)}
                className="flex w-full items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#DEE3E3]">
                  {group.photoUrl ? (
                    <img src={group.photoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-[#2A3030]">{initials(group.name)}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-base font-semibold text-[#0B1C30]">{group.name}</h3>
                    <span className="shrink-0 text-xs font-semibold tracking-[0.05em] text-[#404848]">
                      {timeAgo(group.updatedAt)}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-sm text-[#404848]">
                    {group.members.length > 0
                      ? `${group.members[0]?.user.name || "Member"}: ...`
                      : "No messages yet"}
                  </p>

                  <div className="mt-2 flex items-center gap-3 text-xs text-[#6B7280]">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {group.members.length}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {group.members.filter((_, i) => i < 2).length} active
                    </span>
                  </div>
                </div>
              </button>
              {!isArchived ? (
                <button
                  type="button"
                  onClick={() => updateMemberStatus(group.id, "ARCHIVED")}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-white/80 text-[#6B7280] opacity-0 transition hover:bg-[#FEE2E2] hover:text-red-500 group-hover:opacity-100"
                  title="Archive"
                >
                  <Archive className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => updateMemberStatus(group.id, "ACTIVE")}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-white/80 text-[#6B7280] opacity-0 transition hover:bg-[#DCE9FF] hover:text-[#003535] group-hover:opacity-100"
                  title="Unarchive"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-[#6B7280]">No trips found</p>
        )}
      </div>

      <button
        type="button"
        onClick={onFabClick}
        className="absolute bottom-6 right-6 flex size-14 items-center justify-center rounded-full bg-[#FE6B00] text-white shadow-lg shadow-[#FE6B00]/30 transition hover:bg-[#e55f00] active:scale-95"
      >
        <Plus className="size-6" />
      </button>
    </div>
  );
}
