"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Tag, ChevronDown, Camera, Check, X, Repeat, Wallet, Loader2 } from "lucide-react";
import { http } from "@/lib/http";
import { env } from "@/lib/env";
import { useAuthStore } from "@/store/auth-store";
import { listSplitRules, saveSplitRule, uploadReceipt } from "@/features/whatsapp/api";
import type { ApiGroup } from "@/features/whatsapp/api";
import { formatMoney as formatCurrency } from "@/components/app/money";
import { ItemizedSplit, itemsTotal, type ItemDraft } from "./add-expense-itemized";

type SplitMode = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARE" | "ADJUSTMENT" | "ITEMIZED";

const SPLIT_MODES: { value: SplitMode; label: string }[] = [
  { value: "EQUAL", label: "Equal" },
  { value: "UNEQUAL", label: "Unequal" },
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "SHARE", label: "Shares" },
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "ITEMIZED", label: "Itemized" },
];

// Values must match the backend `ExpenseCategory` Prisma enum exactly.
const CATEGORIES: { value: string; label: string }[] = [
  { value: "TRAVEL", label: "Travel" },
  { value: "FOOD", label: "Food & Drink" },
  { value: "STAY", label: "Stay" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "OTHER", label: "Other" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD"];

const RECURRING_FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

// Split modes whose per-member values (not items) can be saved/reused as a rule.
const SAVEABLE_MODES: SplitMode[] = ["UNEQUAL", "PERCENTAGE", "SHARE", "ADJUSTMENT"];

type Props = {
  group: ApiGroup;
  onBack: () => void;
};

export function AddExpense({ group, onBack }: Props) {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState((group.defaultCurrency || "USD").toUpperCase());
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState("OTHER");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [notes, setNotes] = useState("");

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("MONTHLY");

  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);

  const [multiPayer, setMultiPayer] = useState(false);
  const [selectedPayerId, setSelectedPayerId] = useState<number>(authUser?.id ?? 0);
  const [payerIds, setPayerIds] = useState<Set<number>>(new Set(authUser ? [authUser.id] : []));
  const [payerValues, setPayerValues] = useState<Record<number, string>>({});

  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [memberValues, setMemberValues] = useState<Record<number, string>>({});
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<ItemDraft[]>([]);

  const [saveAsRule, setSaveAsRule] = useState(false);
  const [ruleName, setRuleName] = useState("");

  const members = group.members;
  const otherMembers = members.filter((m) => m.userId !== authUser?.id);

  // Bound to the selected currency — the old local helper always printed "$".
  const formatMoney = (value: number) => formatCurrency(value, currency);

  const includedMembers = useMemo(
    () => members.filter((m) => !excludedIds.has(m.userId)),
    [members, excludedIds],
  );

  const totalAmount = parseFloat(amount) || 0;

  const equalShare = includedMembers.length > 0 ? totalAmount / includedMembers.length : 0;

  const percentTotal = useMemo(
    () => includedMembers.reduce((sum, m) => sum + (parseFloat(memberValues[m.userId]) || 0), 0),
    [includedMembers, memberValues],
  );
  const exactTotal = useMemo(
    () => includedMembers.reduce((sum, m) => sum + (parseFloat(memberValues[m.userId]) || 0), 0),
    [includedMembers, memberValues],
  );
  const shareTotal = useMemo(
    () => includedMembers.reduce((sum, m) => sum + (parseInt(memberValues[m.userId], 10) || 0), 0),
    [includedMembers, memberValues],
  );
  const adjustmentNet = useMemo(
    () => includedMembers.reduce((sum, m) => sum + (parseFloat(memberValues[m.userId]) || 0), 0),
    [includedMembers, memberValues],
  );
  const itemsSum = useMemo(() => itemsTotal(items), [items]);

  const splitRulesQuery = useQuery({
    queryKey: ["groups", group.id, "split-rules"],
    queryFn: () => listSplitRules(group.id),
  });
  const applicableRules = (splitRulesQuery.data ?? []).filter((rule) =>
    SAVEABLE_MODES.includes(rule.splitType as SplitMode),
  );

  const splitError = useMemo(() => {
    if (splitMode === "EQUAL") {
      return includedMembers.length === 0 ? "Select at least one person" : null;
    }
    if (splitMode === "UNEQUAL") {
      return Math.abs(exactTotal - totalAmount) > 0.01
        ? `Amounts must add up to ${formatCurrency(totalAmount, currency)}`
        : null;
    }
    if (splitMode === "PERCENTAGE") {
      return Math.abs(percentTotal - 100) > 0.01 ? "Percentages must total 100%" : null;
    }
    if (splitMode === "SHARE") {
      return shareTotal <= 0 ? "Enter shares greater than 0" : null;
    }
    if (splitMode === "ADJUSTMENT") {
      return Math.abs(adjustmentNet) > 0.01
        ? `Adjustments must net to ${formatCurrency(0, currency)} (currently ${formatCurrency(adjustmentNet, currency)})`
        : null;
    }
    if (splitMode === "ITEMIZED") {
      if (items.length === 0) return "Add at least one item";
      if (items.some((i) => !i.name.trim() || (parseFloat(i.amount) || 0) <= 0 || i.participantUserIds.length === 0)) {
        return "Each item needs a name, an amount, and at least one person";
      }
      if (Math.abs(itemsSum - totalAmount) > 0.01) {
        return `Item totals must add up to ${formatCurrency(totalAmount, currency)}`;
      }
      return null;
    }
    return null;
  }, [splitMode, includedMembers.length, exactTotal, percentTotal, shareTotal, adjustmentNet, items, itemsSum, totalAmount, currency]);

  const payerTotal = multiPayer
    ? Array.from(payerIds).reduce((sum, id) => sum + (parseFloat(payerValues[id]) || 0), 0)
    : totalAmount;

  const payerError = !multiPayer
    ? null
    : payerIds.size === 0
      ? "Select at least one payer"
      : Math.abs(payerTotal - totalAmount) > 0.01
        ? `Paid amounts must add up to ${formatMoney(totalAmount)}`
        : null;

  const uploadMutation = useMutation({
    mutationFn: uploadReceipt,
    onSuccess: (data, file) => {
      setReceiptUrl(data.url);
      setReceiptName(file.name);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const buildParticipants = () => {
    return includedMembers.map((m) => {
      if (splitMode === "UNEQUAL") {
        return { userId: m.userId, exactAmount: parseFloat(memberValues[m.userId]) || 0 };
      }
      if (splitMode === "PERCENTAGE") {
        return { userId: m.userId, percentage: parseFloat(memberValues[m.userId]) || 0 };
      }
      if (splitMode === "SHARE") {
        return { userId: m.userId, shares: parseInt(memberValues[m.userId], 10) || 0 };
      }
      if (splitMode === "ADJUSTMENT") {
        return { userId: m.userId, adjustmentAmount: parseFloat(memberValues[m.userId]) || 0 };
      }
      return { userId: m.userId };
    });
  };

  const buildPaidBy = () =>
    multiPayer
      ? Array.from(payerIds).map((userId) => ({ userId, amount: parseFloat(payerValues[userId]) || 0 }))
      : [{ userId: selectedPayerId, amount: totalAmount }];

  const createExpenseMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title,
        totalAmount,
        currency,
        splitType: splitMode,
        category,
        notes: notes.trim() || undefined,
        attachmentUrl: receiptUrl || undefined,
        paidBy: buildPaidBy(),
        expenseDate: new Date(expenseDate).toISOString(),
        isRecurring,
        recurringRule: isRecurring ? recurringFrequency : undefined,
      };

      if (splitMode === "ITEMIZED") {
        const itemParticipantIds = new Set<number>();
        items.forEach((item) => item.participantUserIds.forEach((id) => itemParticipantIds.add(id)));
        payload.participants = Array.from(itemParticipantIds).map((userId) => ({ userId }));
        payload.items = items.map((item) => ({
          name: item.name,
          amount: parseFloat(item.amount) || 0,
          quantity: parseInt(item.quantity, 10) || 1,
          participantUserIds: item.participantUserIds,
        }));
      } else {
        payload.participants = buildParticipants();
      }

      const { data } = await http.post(`/groups/${group.id}/expenses`, payload);

      if (saveAsRule && SAVEABLE_MODES.includes(splitMode) && ruleName.trim()) {
        try {
          await saveSplitRule(group.id, {
            name: ruleName.trim(),
            splitType: splitMode,
            config: {
              memberValues,
              excludedIds: Array.from(excludedIds),
            },
          });
          queryClient.invalidateQueries({ queryKey: ["groups", group.id, "split-rules"] });
        } catch {
          // Best-effort: the expense itself already saved successfully.
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", group.id, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      onBack();
    },
  });

  const applyRule = (ruleId: string) => {
    const rule = applicableRules.find((r) => String(r.id) === ruleId);
    if (!rule) return;
    const config = rule.config as { memberValues?: Record<string, string>; excludedIds?: number[] };
    setSplitMode(rule.splitType as SplitMode);
    setMemberValues(config.memberValues ?? {});
    setExcludedIds(new Set(config.excludedIds ?? []));
  };

  const handleMemberValue = (userId: number, val: string, allowDecimal = true) => {
    const cleaned = allowDecimal ? val.replace(/[^0-9.-]/g, "") : val.replace(/[^0-9-]/g, "");
    setMemberValues((prev) => ({ ...prev, [userId]: cleaned }));
  };

  const toggleExcluded = (userId: number) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAll = () => setExcludedIds(new Set());
  const deselectAll = () => setExcludedIds(new Set(members.map((m) => m.userId)));

  const togglePayer = (userId: number) => {
    setPayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const canSave =
    Boolean(title.trim()) &&
    totalAmount > 0 &&
    !splitError &&
    !payerError &&
    !uploadMutation.isPending &&
    !createExpenseMutation.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-raised px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Close"
            className="-ml-1 rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
          >
            {/* Back on mobile (full-screen sheet), close on desktop (centred dialog). */}
            <ArrowLeft className="size-5 lg:hidden" />
            <X className="hidden size-5 lg:block" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-lg leading-tight font-semibold tracking-tight">
              Add expense
            </h1>
            <p className="truncate text-xs text-muted-foreground">{group.name}</p>
          </div>
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => createExpenseMutation.mutate()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-40"
        >
          {createExpenseMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Save
        </button>
      </header>

      {/* pb-32 clears the mobile bottom nav; inside a desktop dialog it's dead space. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-32 lg:pb-4">
        <div className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="space-y-4 p-4">
            <div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter description"
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
            <div className="flex items-center gap-3">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-3 text-sm font-semibold text-foreground focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-right text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
          </div>

          <div className="border-t border-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <CalendarDays className="size-5 text-muted-foreground" />
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="text-sm text-foreground bg-transparent border-none focus:outline-none [color-scheme:light]"
                />
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </div>
          </div>

          <div className="border-t border-border relative">
            <button
              type="button"
              onClick={() => setShowCategoryPicker(!showCategoryPicker)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Tag className="size-5 text-muted-foreground" />
                <span className="text-sm text-foreground">
                  {CATEGORIES.find((c) => c.value === category)?.label ?? "Other"}
                </span>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
            {showCategoryPicker && (
              <div className="absolute left-0 right-0 top-full z-10 mx-4 rounded-lg border border-border bg-surface-raised shadow-lg">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      setCategory(c.value);
                      setShowCategoryPicker(false);
                    }}
                    className={
                      "w-full px-4 py-2.5 text-left text-sm transition first:rounded-t-lg last:rounded-b-lg hover:bg-surface " +
                      (category === c.value ? "font-semibold text-brand-800" : "text-foreground")
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border p-4">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-500/20"
            />
          </div>

          <div className="border-t border-border p-4">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Repeat className="size-4 text-muted-foreground" />
                Repeat this expense
              </span>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="size-4 accent-brand-700"
              />
            </label>
            {isRecurring && (
              <select
                value={recurringFrequency}
                onChange={(e) => setRecurringFrequency(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none"
              >
                {RECURRING_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground">PAID BY</p>
            <button
              type="button"
              onClick={() => setMultiPayer((v) => !v)}
              className="text-xs font-semibold text-accent-600"
            >
              {multiPayer ? "Use single payer" : "Split payment"}
            </button>
          </div>

          {!multiPayer ? (
            <div className="flex flex-wrap gap-2">
              {authUser && (
                <button
                  type="button"
                  onClick={() => setSelectedPayerId(authUser.id)}
                  className={
                    "flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " +
                    (selectedPayerId === authUser.id
                      ? "border-brand-900 bg-brand-900 text-white"
                      : "border-border bg-surface-raised text-foreground hover:bg-surface")
                  }
                >
                  <div className="flex size-6 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-bold text-foreground">
                    {authUser.name?.[0] || "U"}
                  </div>
                  Me
                </button>
              )}
              {otherMembers.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setSelectedPayerId(m.userId)}
                  className={
                    "flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " +
                    (selectedPayerId === m.userId
                      ? "border-brand-900 bg-brand-900 text-white"
                      : "border-border bg-surface-raised text-foreground hover:bg-surface")
                  }
                >
                  <div className="flex size-6 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-bold text-foreground">
                    {(m.user.name || "U")[0]}
                  </div>
                  {m.user.name || `User ${m.userId}`}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm">
              <div className="space-y-1 p-2">
                {members.map((m) => {
                  const checked = payerIds.has(m.userId);
                  return (
                    <div key={m.userId} className="flex items-center justify-between rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => togglePayer(m.userId)}
                          className={
                            "flex size-6 items-center justify-center rounded-full border-2 transition " +
                            (checked ? "border-brand-900 bg-brand-900 text-white" : "border-border bg-surface-raised")
                          }
                        >
                          {checked && <Check className="size-3.5" />}
                        </button>
                        <span className="text-sm font-medium text-foreground">
                          {m.userId === authUser?.id ? "Me" : m.user.name || `User ${m.userId}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">$</span>
                        <input
                          value={payerValues[m.userId] ?? ""}
                          disabled={!checked}
                          onChange={(e) =>
                            setPayerValues((prev) => ({
                              ...prev,
                              [m.userId]: e.target.value.replace(/[^0-9.]/g, ""),
                            }))
                          }
                          placeholder="0.00"
                          className="w-20 rounded border border-border px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20 disabled:opacity-40"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                <span className="text-xs font-semibold text-muted-foreground">PAID:</span>
                <span className={"text-sm font-medium " + (!payerError ? "text-brand-800" : "text-destructive")}>
                  {formatMoney(payerTotal)} / {formatMoney(totalAmount)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground">SPLIT BY</p>
            {applicableRules.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyRule(e.target.value);
                  e.target.value = "";
                }}
                className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-foreground focus:outline-none"
              >
                <option value="" disabled>
                  Use saved split
                </option>
                {applicableRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2">
            {SPLIT_MODES.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSplitMode(tab.value)}
                className={
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition " +
                  (splitMode === tab.value
                    ? "border-brand-900 bg-brand-900 text-white"
                    : "border-border bg-surface-raised text-muted-foreground hover:text-foreground")
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {splitMode !== "ITEMIZED" && (
            <div className="border-b border-border px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Split with subset</span>
                <button
                  type="button"
                  onClick={excludedIds.size > 0 ? selectAll : deselectAll}
                  className="text-xs font-semibold text-accent-600"
                >
                  {excludedIds.size > 0 ? "Select All" : "Deselect All"}
                </button>
              </div>
            </div>
          )}

          {splitMode === "ITEMIZED" ? (
            <ItemizedSplit group={group} items={items} onChange={setItems} />
          ) : (
            <div className="space-y-1 p-2">
              {members.map((m) => {
                const isPayer = !multiPayer && m.userId === selectedPayerId;
                const isExcluded = excludedIds.has(m.userId);
                const isIncluded = !isExcluded;
                const val = memberValues[m.userId] ?? "";

                let preview = "";
                if (splitMode === "EQUAL") {
                  preview = isIncluded ? formatMoney(equalShare) : "$0.00 (Excluded)";
                } else if (splitMode === "SHARE" && isIncluded && shareTotal > 0) {
                  const shares = parseInt(val, 10) || 0;
                  preview = formatMoney((totalAmount * shares) / shareTotal);
                } else if (splitMode === "ADJUSTMENT" && isIncluded) {
                  const adj = parseFloat(val) || 0;
                  preview = formatMoney(equalShare + adj);
                }

                return (
                  <div
                    key={m.userId}
                    className={
                      "flex items-center justify-between rounded-lg px-3 py-2.5 " +
                      (isPayer && isIncluded ? "bg-brand-50" : "") +
                      (isExcluded ? " opacity-50" : "")
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleExcluded(m.userId)}
                        className={
                          "flex size-6 items-center justify-center rounded-full border-2 transition " +
                          (isIncluded ? "border-brand-900 bg-brand-900 text-white" : "border-border bg-surface-raised")
                        }
                      >
                        {isIncluded && <Check className="size-3.5" />}
                      </button>
                      <div className="flex size-8 items-center justify-center rounded-full bg-surface-sunken text-xs font-bold text-foreground">
                        {(m.user.name || "U")[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {m.user.name || `User ${m.userId}`}
                        </p>
                        {isPayer && isIncluded && <p className="text-[10px] text-accent-600">Payer</p>}
                        {(splitMode === "SHARE" || splitMode === "ADJUSTMENT") && isIncluded && preview && (
                          <p className="text-[10px] text-muted-foreground">{preview}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {splitMode === "EQUAL" ? (
                        <span className="text-sm font-medium text-muted-foreground">{preview}</span>
                      ) : splitMode === "PERCENTAGE" ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={val}
                            onChange={(e) => handleMemberValue(m.userId, e.target.value)}
                            placeholder={isIncluded ? "0" : "-"}
                            disabled={isExcluded}
                            className="w-16 rounded border border-border px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20 disabled:opacity-40"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      ) : splitMode === "SHARE" ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={val}
                            onChange={(e) => handleMemberValue(m.userId, e.target.value, false)}
                            placeholder={isIncluded ? "0" : "-"}
                            disabled={isExcluded}
                            className="w-14 rounded border border-border px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20 disabled:opacity-40"
                          />
                          <span className="text-sm text-muted-foreground">sh</span>
                        </div>
                      ) : splitMode === "ADJUSTMENT" ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-muted-foreground">±$</span>
                          <input
                            value={val}
                            onChange={(e) => handleMemberValue(m.userId, e.target.value)}
                            placeholder={isIncluded ? "0.00" : "-"}
                            disabled={isExcluded}
                            className="w-20 rounded border border-border px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20 disabled:opacity-40"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-muted-foreground">$</span>
                          <input
                            value={val}
                            onChange={(e) => handleMemberValue(m.userId, e.target.value)}
                            placeholder={isIncluded ? "0.00" : "-"}
                            disabled={isExcluded}
                            className="w-20 rounded border border-border px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20 disabled:opacity-40"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {splitMode === "PERCENTAGE" && includedMembers.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground">TOTAL:</span>
              <span className={"text-sm font-medium " + (!splitError ? "text-brand-800" : "text-destructive")}>
                {percentTotal.toFixed(0)}%
              </span>
            </div>
          )}

          {splitMode === "UNEQUAL" && includedMembers.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground">TOTAL:</span>
              <span className={"text-sm font-medium " + (!splitError ? "text-brand-800" : "text-destructive")}>
                {formatMoney(exactTotal)}
              </span>
            </div>
          )}

          {splitMode === "SHARE" && includedMembers.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground">TOTAL SHARES:</span>
              <span className={"text-sm font-medium " + (!splitError ? "text-brand-800" : "text-destructive")}>
                {shareTotal}
              </span>
            </div>
          )}

          {splitMode === "ADJUSTMENT" && includedMembers.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground">ADJUSTMENTS NET:</span>
              <span className={"text-sm font-medium " + (!splitError ? "text-brand-800" : "text-destructive")}>
                {formatMoney(adjustmentNet)}
              </span>
            </div>
          )}

          {splitMode === "ITEMIZED" && items.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground">ITEMS TOTAL:</span>
              <span className={"text-sm font-medium " + (!splitError ? "text-brand-800" : "text-destructive")}>
                {formatMoney(itemsSum)} / {formatMoney(totalAmount)}
              </span>
            </div>
          )}

          {SAVEABLE_MODES.includes(splitMode) && (
            <div className="border-t border-border p-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={saveAsRule}
                  onChange={(e) => setSaveAsRule(e.target.checked)}
                  className="size-4 accent-brand-700"
                />
                Save this split for reuse
              </label>
              {saveAsRule && (
                <input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Name this split (e.g. Roommates 50/50)"
                  className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20"
                />
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-border bg-surface-raised p-3">
          {receiptUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- user upload */}
              <img
                src={`${env.apiBaseUrl}${receiptUrl}`}
                alt="Receipt"
                className="size-12 shrink-0 rounded-lg object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {receiptName || "Receipt attached"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setReceiptUrl(null);
                  setReceiptName(null);
                }}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-surface"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="flex w-full items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:bg-surface"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Camera className="size-4" />
                  Attach Receipt
                </>
              )}
            </button>
          )}
          {uploadMutation.isError && (
            <p className="mt-1 text-center text-xs text-destructive">Couldn&apos;t upload that image. Try again.</p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {(splitError || payerError) && (
          <div className="flex items-center gap-2 rounded-xl bg-negative-soft px-4 py-3 text-sm text-destructive">
            <Wallet className="size-4 shrink-0" />
            {payerError || splitError}
          </div>
        )}
      </div>

      {/* `sticky`, not `fixed` — a fixed toast anchors to the viewport and would float at
          the bottom of the screen rather than inside the dialog. */}
      {createExpenseMutation.isError && (
        <div className="sticky bottom-0 shrink-0 border-t border-destructive/20 bg-negative-soft px-4 py-3 text-sm font-medium text-destructive">
          Couldn&apos;t create that expense. Please try again.
        </div>
      )}
    </div>
  );
}
