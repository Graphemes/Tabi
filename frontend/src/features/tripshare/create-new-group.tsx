"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, Loader2, Search } from "lucide-react";
import { discoverUsers, createGroup, addGroupMember } from "@/features/whatsapp/api";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getDisplayName(u: {
  contactName?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return u.contactName || u.name || u.username || u.email || u.phone || "Unknown";
}

type Props = {
  onBack: () => void;
  onGroupCreated?: () => void;
};

export function CreateNewGroup({ onBack, onGroupCreated }: Props) {
  const queryClient = useQueryClient();
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const searchQuery_ = useQuery({
    queryKey: ["discover", searchQuery],
    queryFn: () => discoverUsers(searchQuery || undefined),
    enabled: true,
  });

  const contacts = useMemo(() => {
    const data = searchQuery_.data ?? [];
    return data.slice(0, 20);
  }, [searchQuery_.data]);

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const group = await createGroup({ name: groupName });
      for (const userId of selectedIds) {
        await addGroupMember(group.id, userId);
      }
      return group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      onGroupCreated?.();
      onBack();
    },
  });

  const toggleMember = (userId: number) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full p-1 text-[#404848] hover:bg-[#DCE9FF]"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-lg font-bold text-[#003535]">New Group</h1>
        </div>
        <button
          type="button"
          disabled={!groupName.trim() || selectedIds.length === 0 || createGroupMutation.isPending}
          onClick={() => createGroupMutation.mutate()}
          className="rounded-xl bg-[#003535] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#002828] disabled:opacity-50"
        >
          {createGroupMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create"}
        </button>
      </header>

      <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#DEE3E3]">
            <Camera className="size-6 text-[#6B7280]" />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.05em] text-[#6B7280]">
              GROUP NAME
            </label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="E.g., Tokyo Dream Team"
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
            />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            className="w-full rounded-xl border-0 bg-white py-3.5 pl-10 pr-4 text-sm text-[#0B1C30] shadow-sm ring-1 ring-[#E2E8F0] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
          />
        </div>

        {contacts.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-[#6B7280]">SUGGESTED</p>
            <div className="space-y-1">
              {contacts.map((user) => {
                const isSelected = selectedIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleMember(user.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isSelected ? "bg-[#DCE9FF]" : "hover:bg-[#F1F4F9]"
                    }`}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D3E4FE]">
                      <span className="text-sm font-semibold text-[#0B1C30]">
                        {initials(getDisplayName(user))}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#0B1C30]">
                        {getDisplayName(user)}
                      </p>
                      <p className="truncate text-xs text-[#6B7280]">
                        {user.phone ? user.phone : user.username ? `@${user.username}` : ""}
                      </p>
                    </div>
                    {isSelected ? (
                      <div className="flex size-6 items-center justify-center rounded-full border-2 border-[#003535] bg-[#003535]">
                        <Check className="size-3.5 text-white" />
                      </div>
                    ) : (
                      <div className="flex size-6 items-center justify-center rounded-full border-2 border-[#BFC8C8]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {searchQuery && contacts.length === 0 && !searchQuery_.isLoading && (
          <p className="py-4 text-center text-sm text-[#6B7280]">No contacts found</p>
        )}

        {createGroupMutation.isError && (
          <p className="text-sm text-red-500">
            {createGroupMutation.error?.message || "Could not create group"}
          </p>
        )}
      </div>
    </div>
  );
}
