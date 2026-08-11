"use client";

import { useQuery } from "@tanstack/react-query";
import { Receipt, CalendarDays, Tag, StickyNote, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ScreenHeader } from "@/components/app/screen-header";
import { UserAvatar } from "@/components/app/user-avatar";
import { MoneyText, formatMoney } from "@/components/app/money";
import { env } from "@/lib/env";
import { listGroupExpenses } from "@/features/whatsapp/api";
import type { ApiGroup } from "@/features/whatsapp/api";
import type { ExpenseRef } from "./navigation/nav-state";

type Participant = {
  userId: number;
  owedAmount: string | number;
  paidAmount: string | number;
  user?: { name?: string | null; username?: string | null; phone?: string | null } | null;
};

type ExpenseDetailRow = {
  id: number;
  title: string;
  totalAmount: string | number;
  currency: string;
  category?: string | null;
  notes?: string | null;
  attachmentUrl?: string | null;
  expenseDate: string;
  splitType: string;
  participants?: Participant[];
};

const SPLIT_LABELS: Record<string, string> = {
  EQUAL: "Split equally",
  UNEQUAL: "Exact amounts",
  PERCENTAGE: "By percentage",
  SHARE: "By shares",
  ADJUSTMENT: "With adjustments",
  ITEMIZED: "By item",
};

export function ExpenseDetail({
  selected,
  group,
  onBack,
}: {
  selected: ExpenseRef | null;
  group: ApiGroup | null;
  onBack: () => void;
}) {
  // Reads the list query the Expenses pane already populated — no extra endpoint.
  const { data, isPending } = useQuery({
    queryKey: ["groups", selected?.groupId, "expenses"],
    queryFn: () => listGroupExpenses(Number(selected!.groupId)),
    enabled: Boolean(selected?.groupId),
  });

  const expense = (data as ExpenseDetailRow[] | undefined)?.find(
    (e) => e.id === selected?.expenseId,
  );

  if (!selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          icon={Receipt}
          title="No expense selected"
          description="Pick an expense to see the full breakdown of who paid and who owes."
        />
      </div>
    );
  }

  if (isPending || !expense) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader title="Expense" onBack={onBack} />
        <div className="flex flex-1 items-center justify-center">
          {isPending ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">This expense is no longer available.</p>
          )}
        </div>
      </div>
    );
  }

  const currency = expense.currency;
  const participants = expense.participants ?? [];
  const payers = participants.filter((p) => Number(p.paidAmount) > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title={expense.title} subtitle={group?.name} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:pb-6">
        <div className="mx-auto w-full max-w-xl space-y-4">
          <div className="rounded-2xl border border-border bg-surface-raised p-5 text-center shadow-card">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Total
            </p>
            <p className="tabular mt-1 font-heading text-3xl font-semibold">
              {formatMoney(Number(expense.totalAmount), currency)}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2 py-1">
                <Tag className="size-3.5" />
                {SPLIT_LABELS[expense.splitType] ?? expense.splitType}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2 py-1">
                <CalendarDays className="size-3.5" />
                {new Date(expense.expenseDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {expense.category && (
                <span className="rounded-lg bg-surface-sunken px-2 py-1 capitalize">
                  {expense.category.toLowerCase().replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>

          {payers.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface-raised shadow-card">
              <h3 className="border-b border-border px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Paid by
              </h3>
              <ul className="divide-y divide-border">
                {payers.map((p) => (
                  <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
                    <UserAvatar
                      name={p.user?.name || p.user?.username || `User ${p.userId}`}
                      seed={p.userId}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.user?.name || p.user?.username || `User ${p.userId}`}
                    </span>
                    <MoneyText
                      amount={Number(p.paidAmount)}
                      currency={currency}
                      tone="neutral"
                      className="text-sm"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface-raised shadow-card">
            <h3 className="border-b border-border px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Split between
            </h3>
            <ul className="divide-y divide-border">
              {participants.map((p) => {
                const net = Number(p.paidAmount) - Number(p.owedAmount);
                const name = p.user?.name || p.user?.username || `User ${p.userId}`;
                return (
                  <li key={p.userId} className="flex items-center gap-3 px-4 py-3">
                    <UserAvatar name={name} seed={p.userId} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{name}</span>
                      <span className="block text-xs text-muted-foreground">
                        owes {formatMoney(Number(p.owedAmount), currency)}
                      </span>
                    </span>
                    <MoneyText amount={net} currency={currency} signed className="text-sm" />
                  </li>
                );
              })}
            </ul>
          </section>

          {expense.notes && (
            <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-card">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <StickyNote className="size-3.5" />
                Notes
              </h3>
              <p className="text-sm whitespace-pre-wrap">{expense.notes}</p>
            </section>
          )}

          {expense.attachmentUrl && (
            <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-card">
              <h3 className="border-b border-border px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Receipt
              </h3>
              {/* eslint-disable-next-line @next/next/no-img-element -- user upload */}
              <img
                src={`${env.apiBaseUrl}${expense.attachmentUrl}`}
                alt="Receipt"
                className="max-h-96 w-full object-contain"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
