"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/app/user-avatar";
import { EmptyState } from "@/components/app/empty-state";
import { discoverUsers, createGroup, addGroupMember } from "@/features/whatsapp/api";

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
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Was firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const contactsQuery = useQuery({
    queryKey: ["discover", debouncedSearch],
    queryFn: () => discoverUsers(debouncedSearch || undefined),
  });

  const contacts = useMemo(() => (contactsQuery.data ?? []).slice(0, 30), [contactsQuery.data]);
  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedIds.includes(c.id)),
    [contacts, selectedIds],
  );

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const group = await createGroup({ name: groupName.trim() });
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

  const toggleMember = (userId: number) =>
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

  const canCreate = groupName.trim().length > 0 && !createGroupMutation.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-lg leading-tight font-semibold tracking-tight">
            New trip
          </h1>
          <p className="text-xs text-muted-foreground">
            {selectedIds.length > 0
              ? `${selectedIds.length} ${selectedIds.length === 1 ? "person" : "people"} invited`
              : "Name it, then add your people"}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-5">
          <div className="space-y-1.5">
            <label htmlFor="trip-name" className="text-xs font-medium text-muted-foreground">
              Trip name
            </label>
            <input
              id="trip-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Goa 2026, Tokyo with the crew…"
              autoFocus
              className="h-11 w-full rounded-xl border border-border bg-surface-raised px-3.5 text-sm transition placeholder:text-muted-foreground focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
            />
          </div>

          {selectedContacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedContacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleMember(c.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 py-1 pr-2 pl-1 text-xs font-medium text-brand-800 transition hover:bg-brand-200"
                >
                  <UserAvatar name={getDisplayName(c)} seed={c.id} size="xs" />
                  {getDisplayName(c)}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="member-search" className="text-xs font-medium text-muted-foreground">
              Add people
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="member-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or phone"
                className="h-11 w-full rounded-xl border border-border bg-surface-raised pr-3 pl-10 text-sm transition placeholder:text-muted-foreground focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
              {contactsQuery.isPending ? (
                <div className="space-y-3 p-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-8 shrink-0 rounded-full" />
                      <Skeleton className="h-3.5 w-1/3" />
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Nobody found"
                  description={
                    debouncedSearch
                      ? "No one matches that search."
                      : "Contacts you can invite will show up here."
                  }
                  className="py-8"
                />
              ) : (
                <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                  {contacts.map((contact) => {
                    const selected = selectedIds.includes(contact.id);
                    const name = getDisplayName(contact);
                    return (
                      <li key={contact.id}>
                        <button
                          type="button"
                          onClick={() => toggleMember(contact.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-hover"
                        >
                          <UserAvatar name={name} seed={contact.id} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{name}</span>
                            {contact.phone && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {contact.phone}
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition",
                              selected
                                ? "border-brand-700 bg-brand-700 text-white"
                                : "border-border",
                            )}
                          >
                            {selected && <Check className="size-3" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {createGroupMutation.isError && (
            <p className="text-sm text-destructive">Couldn&apos;t create the trip. Try again.</p>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-surface-raised p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          size="lg"
          className="h-11 w-full"
          disabled={!canCreate}
          onClick={() => createGroupMutation.mutate()}
        >
          {createGroupMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Create trip
        </Button>
      </footer>
    </div>
  );
}
