"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Tag, ChevronDown, Camera, Check } from "lucide-react";
import { http } from "@/lib/http";
import { useAuthStore } from "@/store/auth-store";
import type { ApiGroup } from "@/features/whatsapp/api";

type SplitMode = "EQUAL" | "PERCENTAGE" | "EXACT";

type Props = {
  group: ApiGroup;
  onBack: () => void;
};

export function AddExpense({ group, onBack }: Props) {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedPayerId, setSelectedPayerId] = useState<number>(authUser?.id ?? 0);
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [memberValues, setMemberValues] = useState<Record<number, string>>({});
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState("General");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = ["General", "Food & Drink", "Transportation", "Accommodation", "Shopping", "Entertainment", "Utilities", "Healthcare"];

  const members = group.members;
  const includedMembers = useMemo(
    () => members.filter((m) => !excludedIds.has(m.userId)),
    [members, excludedIds],
  );

  const totalAmount = parseFloat(amount) || 0;

  const equalShare = includedMembers.length > 0
    ? (totalAmount / includedMembers.length).toFixed(2)
    : "0.00";

  const percentTotal = useMemo(() => {
    if (splitMode !== "PERCENTAGE") return 0;
    return includedMembers.reduce((sum, m) => sum + (parseFloat(memberValues[m.userId]) || 0), 0);
  }, [splitMode, includedMembers, memberValues]);

  const exactTotal = useMemo(() => {
    if (splitMode !== "EXACT") return 0;
    return includedMembers.reduce((sum, m) => sum + (parseFloat(memberValues[m.userId]) || 0), 0);
  }, [splitMode, includedMembers, memberValues]);

  const categoryMap: Record<string, string> = {
    General: "OTHER",
    "Food & Drink": "FOOD_AND_DRINK",
    Transportation: "TRANSPORTATION",
    Accommodation: "ACCOMMODATION",
    Shopping: "SHOPPING",
    Entertainment: "ENTERTAINMENT",
    Utilities: "UTILITIES",
    Healthcare: "HEALTHCARE",
  };

  const createExpenseMutation = useMutation({
    mutationFn: () =>
      http.post(`/groups/${group.id}/expenses`, {
        title,
        totalAmount,
        currency: group.defaultCurrency || "USD",
        splitType: splitMode === "EXACT" ? "UNEQUAL" : splitMode,
        category: categoryMap[category] || "OTHER",
        paidBy: [{ userId: selectedPayerId, amount: totalAmount }],
        participants: includedMembers.map((m) => ({
          userId: m.userId,
          ...(splitMode === "EXACT" ? { exactAmount: parseFloat(memberValues[m.userId]) || 0 } : {}),
          ...(splitMode === "PERCENTAGE" ? { percentage: parseFloat(memberValues[m.userId]) || 0 } : {}),
        })),
        expenseDate: new Date(expenseDate).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", group.id, "expenses"] });
      onBack();
    },
  });

  const otherMembers = members.filter((m) => m.userId !== authUser?.id);

  const handleMemberValue = (userId: number, val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, "");
    setMemberValues((prev) => ({ ...prev, [userId]: cleaned }));
  };

  const toggleExcluded = (userId: number) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const selectAll = () => setExcludedIds(new Set());
  const deselectAll = () => setExcludedIds(new Set(members.map((m) => m.userId)));

  const tabsForMode: Record<SplitMode, { label: string; mode: SplitMode }[]> = {
    EQUAL: [
      { label: "Equal", mode: "EQUAL" },
      { label: "%", mode: "PERCENTAGE" },
      { label: "Adj.", mode: "EXACT" },
    ],
    PERCENTAGE: [
      { label: "Equal", mode: "EQUAL" },
      { label: "%", mode: "PERCENTAGE" },
      { label: "Shares", mode: "EXACT" },
    ],
    EXACT: [
      { label: "Equal", mode: "EQUAL" },
      { label: "%", mode: "PERCENTAGE" },
      { label: "Exact", mode: "EXACT" },
    ],
  };

  return (
    <div className="flex flex-1 flex-col bg-[#F8F9FF]">
      <header className="flex items-center justify-between border-b border-[#E2E8F0] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="rounded-full p-1 hover:bg-[#DCE9FF]">
            <ArrowLeft className="size-5 text-[#404848]" />
          </button>
          <h1 className="text-lg font-semibold text-[#0B1C30]">Add Expense</h1>
        </div>
        <button
          type="button"
          disabled={!title.trim() || totalAmount <= 0 || createExpenseMutation.isPending}
          onClick={() => createExpenseMutation.mutate()}
          className="rounded-full bg-[#FE6B00] px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          SAVE
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-32">
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="space-y-4 p-4">
            <div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter description"
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8F9FF] px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold text-[#0B1C30]">$</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8F9FF] px-4 py-3 text-right text-xl font-semibold text-[#0B1C30] placeholder:text-[#BFC8C8] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
              />
            </div>
          </div>

          <div className="border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <CalendarDays className="size-5 text-[#404848]" />
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="text-sm text-[#0B1C30] bg-transparent border-none focus:outline-none [color-scheme:light]"
                />
              </div>
              <ChevronDown className="size-4 text-[#404848]" />
            </div>
          </div>

          <div className="border-t border-[#E2E8F0] relative">
            <button
              type="button"
              onClick={() => setShowCategoryPicker(!showCategoryPicker)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Tag className="size-5 text-[#404848]" />
                <span className="text-sm text-[#0B1C30]">{category}</span>
              </div>
              <ChevronDown className="size-4 text-[#404848]" />
            </button>
            {showCategoryPicker && (
              <div className="absolute left-0 right-0 top-full z-10 mx-4 rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCategory(c); setShowCategoryPicker(false); }}
                    className={"w-full px-4 py-2.5 text-left text-sm transition first:rounded-t-lg last:rounded-b-lg hover:bg-[#F8F9FF] " + (category === c ? "font-semibold text-[#003535]" : "text-[#0B1C30]")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold tracking-wider text-[#6B7280]">PAID BY</p>
          <div className="flex flex-wrap gap-2">
            {authUser && (
              <button
                type="button"
                onClick={() => setSelectedPayerId(authUser.id)}
                className={"flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " + (selectedPayerId === authUser.id
                  ? "border-[#003535] bg-[#003535] text-white"
                  : "border-[#E2E8F0] bg-white text-[#0B1C30] hover:bg-[#F8F9FF]")}
              >
                <div className="flex size-6 items-center justify-center rounded-full bg-[#DEE3E3] text-[10px] font-bold text-[#2A3030]">
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
                className={"flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition " + (selectedPayerId === m.userId
                  ? "border-[#003535] bg-[#003535] text-white"
                  : "border-[#E2E8F0] bg-white text-[#0B1C30] hover:bg-[#F8F9FF]")}
              >
                <div className="flex size-6 items-center justify-center rounded-full bg-[#DEE3E3] text-[10px] font-bold text-[#2A3030]">
                  {(m.user.name || "U")[0]}
                </div>
                {m.user.name || `User ${m.userId}`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-[#6B7280]">SPLIT BY</p>
            <span className="rounded border border-[#FE6B00]/30 bg-[#FE6B00]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FE6B00]">
              MODE: {splitMode}
            </span>
          </div>

          <div className="flex border-b border-[#E2E8F0]">
            {tabsForMode[splitMode].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setSplitMode(tab.mode)}
                className={"flex-1 border-b-2 py-3 text-center text-sm font-medium transition " + (splitMode === tab.mode
                  ? "border-[#003535] text-[#003535]"
                  : "border-transparent text-[#6B7280] hover:text-[#0B1C30]")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="border-b border-[#E2E8F0] px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#0B1C30]">Split with subset</span>
              <button
                type="button"
                onClick={excludedIds.size > 0 ? selectAll : deselectAll}
                className="text-xs font-semibold text-[#FE6B00]"
              >
                {excludedIds.size > 0 ? "Select All" : "Deselect All"}
              </button>
            </div>
          </div>

          <div className="space-y-1 p-2">
            {members.map((m) => {
              const isPayer = m.userId === selectedPayerId;
              const isExcluded = excludedIds.has(m.userId);
              const isIncluded = !isExcluded;
              const val = memberValues[m.userId] ?? "";

              let displayAmount = "";
              if (splitMode === "EQUAL" && isIncluded) {
                displayAmount = `$${equalShare}`;
              } else if (splitMode === "EQUAL" && isExcluded) {
                displayAmount = "$0.00";
              }

              return (
                <div
                  key={m.userId}
                  className={"flex items-center justify-between rounded-lg px-3 py-2.5 " + (isPayer && isIncluded ? "bg-[#F0F7FF]" : "") + (isExcluded ? " opacity-50" : "")}
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExcluded(m.userId)}
                      className={"flex size-6 items-center justify-center rounded-full border-2 transition " + (isIncluded
                        ? "border-[#003535] bg-[#003535] text-white"
                        : "border-[#DEE3E3] bg-white")}
                    >
                      {isIncluded && <Check className="size-3.5" />}
                    </button>
                    <div className="flex size-8 items-center justify-center rounded-full bg-[#DEE3E3] text-xs font-bold text-[#2A3030]">
                      {(m.user.name || "U")[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#0B1C30]">
                        {m.user.name || `User ${m.userId}`}
                      </p>
                      {isPayer && isIncluded && (
                        <p className="text-[10px] text-[#FE6B00]">Payer</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {splitMode === "EQUAL" ? (
                      <span className="text-sm font-medium text-[#6B7280]">
                        {isExcluded ? "$0.00 (Excluded)" : displayAmount}
                      </span>
                    ) : splitMode === "PERCENTAGE" ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={val}
                          onChange={(e) => handleMemberValue(m.userId, e.target.value)}
                          placeholder={isIncluded ? "0" : "-"}
                          disabled={isExcluded}
                          className="w-16 rounded border border-[#E2E8F0] px-2 py-1 text-right text-sm text-[#0B1C30] focus:outline-none focus:ring-1 focus:ring-[#FE6B00]/30 disabled:opacity-40"
                        />
                        <span className="text-sm text-[#6B7280]">%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-[#6B7280]">$</span>
                        <input
                          value={val}
                          onChange={(e) => handleMemberValue(m.userId, e.target.value)}
                          placeholder={isIncluded ? "0.00" : "-"}
                          disabled={isExcluded}
                          className="w-20 rounded border border-[#E2E8F0] px-2 py-1 text-right text-sm text-[#0B1C30] focus:outline-none focus:ring-1 focus:ring-[#FE6B00]/30 disabled:opacity-40"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {splitMode === "PERCENTAGE" && includedMembers.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#E2E8F0] px-4 py-2.5">
              <span className="text-xs font-semibold text-[#6B7280]">TOTAL:</span>
              <span className={"text-sm font-medium " + (percentTotal === 100 ? "text-[#003535]" : "text-red-500")}>
                {percentTotal.toFixed(0)}%
              </span>
            </div>
          )}

          {splitMode === "EXACT" && includedMembers.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#E2E8F0] px-4 py-2.5">
              <span className="text-xs font-semibold text-[#6B7280]">TOTAL:</span>
              <span className={"text-sm font-medium " + (Math.abs(exactTotal - totalAmount) < 0.01 ? "text-[#003535]" : "text-red-500")}>
                ${exactTotal.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#E2E8F0] bg-white py-4 text-sm text-[#6B7280] hover:bg-[#F8F9FF]"
        >
          <Camera className="size-4" />
          Attach Receipt
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            // receipt attachment handled here
          }}
        />
      </div>

      {createExpenseMutation.isError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-red-500 px-4 py-2 text-sm text-white shadow-lg">
          Failed to create expense. Please try again.
        </div>
      )}
    </div>
  );
}
