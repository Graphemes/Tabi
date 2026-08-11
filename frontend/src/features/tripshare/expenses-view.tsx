"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Wallet, Plus, Search, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { EmptyState } from "@/components/app/empty-state";
import { ScreenHeader } from "@/components/app/screen-header";
import { UserAvatar } from "@/components/app/user-avatar";
import { MoneyText } from "@/components/app/money";
import { listGroupExpenses } from "@/features/whatsapp/api";
import type { ApiGroup } from "@/features/whatsapp/api";
import type { ExpenseRef } from "./navigation/nav-state";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ExpenseRow = {
  id: number;
  title: string;
  totalAmount: number;
  currency: string;
  expenseDate: string;
  category?: string | null;
  createdBy?: { name?: string | null; username?: string | null; phone?: string | null } | null;
  participants?: unknown[];
};

type Props = {
  groups: ApiGroup[];
  selected: ExpenseRef | null;
  onSelectExpense: (ref: ExpenseRef) => void;
  onAddExpense: (groupId: number) => void;
  onOpenProfile: () => void;
};

export function ExpensesView({
  groups,
  selected,
  onSelectExpense,
  onAddExpense,
  onOpenProfile,
}: Props) {
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [search, setSearch] = useState("");

  const queries = useMemo(
    () =>
      groups.map((g) => ({
        queryKey: ["groups", g.id, "expenses"],
        queryFn: () => listGroupExpenses(g.id),
      })),
    [groups],
  );

  const results = useQueries({ queries });

  const allExpenses = useMemo(() => {
    const flat: Array<{ expense: ExpenseRow; group: ApiGroup }> = [];
    results.forEach((result, i) => {
      if (result.data && groups[i]) {
        (result.data as ExpenseRow[]).forEach((expense) =>
          flat.push({ expense, group: groups[i] }),
        );
      }
    });
    flat.sort(
      (a, b) =>
        new Date(b.expense.expenseDate).getTime() - new Date(a.expense.expenseDate).getTime(),
    );
    if (!search.trim()) return flat;
    const q = search.toLowerCase();
    return flat.filter(
      ({ expense, group }) =>
        expense.title.toLowerCase().includes(q) || group.name.toLowerCase().includes(q),
    );
  }, [results, groups, search]);

  // `isPending`, not `isLoading` — on desktop this pane stays mounted, and using
  // isLoading would blank the whole list on every background refetch.
  const isPending = results.some((r) => r.isPending);

  const handleAddClick = () => {
    if (groups.length === 0) return;
    if (groups.length === 1) return onAddExpense(groups[0].id);
    setShowGroupPicker(true);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Expenses" onOpenProfile={onOpenProfile} />

      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses"
            className="h-10 w-full rounded-xl border border-border bg-surface-raised pr-3 pl-10 text-sm shadow-card transition placeholder:text-muted-foreground focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 md:pb-6">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3"
              >
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ) : allExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={search ? "No matching expenses" : "No expenses yet"}
            description={
              search
                ? "Try a different search."
                : "Add your first expense and Tabi will work out who owes what."
            }
            action={
              !search &&
              groups.length > 0 && (
                <Button size="lg" onClick={handleAddClick}>
                  <Plus className="size-4" />
                  Add expense
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-2">
            {allExpenses.map(({ expense, group }) => {
              const isSelected =
                selected?.expenseId === expense.id && selected?.groupId === group.id;
              const payer = expense.createdBy;
              const payerName =
                payer?.name || payer?.username || payer?.phone || "Unknown";
              const people = expense.participants?.length ?? 0;

              return (
                <li key={`${group.id}-${expense.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelectExpense({ groupId: group.id, expenseId: expense.id })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                      isSelected
                        ? "border-brand-300 bg-brand-50 shadow-card dark:bg-brand-100/40"
                        : "border-border bg-surface-raised shadow-card hover:border-brand-200 hover:bg-surface-hover",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
                      <Wallet className="size-5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{expense.title}</span>
                        <MoneyText
                          amount={expense.totalAmount}
                          currency={expense.currency}
                          tone="neutral"
                          className="shrink-0 text-sm"
                        />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {group.name} · {timeAgo(expense.expenseDate)}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserAvatar name={payerName} seed={payerName} size="xs" />
                        <span className="truncate">
                          {payerName} paid · {people} {people === 1 ? "person" : "people"}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {groups.length > 0 && (
        <button
          type="button"
          onClick={handleAddClick}
          aria-label="Add expense"
          className="absolute right-5 bottom-5 flex size-13 items-center justify-center rounded-2xl bg-accent-500 text-white shadow-raised transition hover:bg-accent-600 active:scale-95"
        >
          <Plus className="size-6" />
        </button>
      )}

      <ResponsiveModal
        open={showGroupPicker}
        onOpenChange={setShowGroupPicker}
        title="Choose a trip"
        className="lg:w-[min(26rem,92vw)]"
      >
        <div className="flex min-h-0 flex-col">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-base font-semibold">Add expense to</h2>
            <p className="text-sm text-muted-foreground">Pick a trip for this expense.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setShowGroupPicker(false);
                  onAddExpense(g.id);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-surface-hover"
              >
                <UserAvatar name={g.name} photoUrl={g.photoUrl} seed={g.id} size="sm" square />
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                <span className="text-xs text-muted-foreground">
                  {g.members.length} members
                </span>
              </button>
            ))}
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
