"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Wallet, Loader2 } from "lucide-react";
import { listGroupExpenses } from "@/features/whatsapp/api";
import type { ApiGroup } from "@/features/whatsapp/api";

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

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

type Props = {
  groups: ApiGroup[];
  onSelectGroup: (id: number) => void;
};

export function ExpensesView({ groups }: Props) {
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
    const flat: Array<{ expense: any; group: ApiGroup }> = [];
    results.forEach((result, i) => {
      if (result.data && groups[i]) {
        result.data.forEach((exp: any) =>
          flat.push({ expense: exp, group: groups[i] }),
        );
      }
    });
    flat.sort(
      (a, b) =>
        new Date(b.expense.expenseDate).getTime() -
        new Date(a.expense.expenseDate).getTime(),
    );
    return flat;
  }, [results, groups]);

  const isLoading = results.some((r) => r.isLoading);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#6B7280]" />
      </div>
    );
  }

  if (!allExpenses.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="size-16 rounded-2xl bg-[#DCE9FF] flex items-center justify-center">
          <Wallet className="size-7 text-[#003535]" />
        </div>
        <h3 className="text-lg font-semibold text-[#0B1C30]">No expenses yet</h3>
        <p className="max-w-xs text-sm text-[#6B7280]">
          Expenses will appear here once your group starts tracking them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
      <h2 className="pt-1 text-lg font-bold text-[#0B1C30]">All Expenses</h2>
      <div className="flex flex-col gap-2">
        {allExpenses.map(({ expense, group }) => {
          const paidByUser = expense.createdBy;
          const participantCount = expense.participants?.length ?? 0;
          return (
            <div
              key={expense.id}
              className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFF3E8]">
                <Wallet className="size-5 text-[#FE6B00]" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-[#0B1C30]">
                  {expense.title}
                </span>
                <span className="text-xs text-[#6B7280]">
                  {group.name} &middot; {timeAgo(expense.expenseDate)}
                </span>
                <span className="text-xs text-[#6B7280]">
                  Paid by{" "}
                  {paidByUser?.name ||
                    paidByUser?.username ||
                    paidByUser?.email ||
                    paidByUser?.phone ||
                    "Unknown"}{" "}
                  &middot;{" "}
                  {participantCount} {participantCount === 1 ? "person" : "people"}
                </span>
              </div>
              <span className="shrink-0 text-sm font-bold text-[#0B1C30]">
                {formatAmount(expense.totalAmount, expense.currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
