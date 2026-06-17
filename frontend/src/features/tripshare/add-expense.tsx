"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Image as ImageIcon, CalendarDays, Tag, ChevronDown, Plus } from "lucide-react";
import { http } from "@/lib/http";
import { useAuthStore } from "@/store/auth-store";
import type { ApiGroup } from "@/features/whatsapp/api";

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

  const today = new Date().toISOString().split("T")[0];

  const createExpenseMutation = useMutation({
    mutationFn: () =>
      http.post(`/groups/${group.id}/expenses`, {
        title,
        totalAmount: parseFloat(amount) || 0,
        currency: group.defaultCurrency || "USD",
        splitType: "EQUAL" as const,
        paidBy: [{ userId: selectedPayerId, amount: parseFloat(amount) || 0 }],
        participants: group.members.map((m) => ({ userId: m.userId })),
        expenseDate: today,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", group.id, "expenses"] });
      onBack();
    },
  });

  const otherMembers = group.members.filter((m) => m.userId !== authUser?.id);

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
          disabled={!title.trim() || !amount || parseFloat(amount) <= 0 || createExpenseMutation.isPending}
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
                <span className="text-sm text-[#0B1C30]">{today}</span>
              </div>
              <ChevronDown className="size-4 text-[#404848]" />
            </div>
          </div>

          <div className="border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Tag className="size-5 text-[#404848]" />
                <span className="text-sm text-[#0B1C30]">General</span>
              </div>
              <ChevronDown className="size-4 text-[#404848]" />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold tracking-wider text-[#6B7280]">PAID BY</p>
          <div className="flex flex-wrap gap-2">
            {authUser && (
              <button
                type="button"
                onClick={() => setSelectedPayerId(authUser.id)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  selectedPayerId === authUser.id
                    ? "border-[#003535] bg-[#003535] text-white"
                    : "border-[#E2E8F0] bg-white text-[#0B1C30] hover:bg-[#F8F9FF]"
                }`}
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
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  selectedPayerId === m.userId
                    ? "border-[#003535] bg-[#003535] text-white"
                    : "border-[#E2E8F0] bg-white text-[#0B1C30] hover:bg-[#F8F9FF]"
                }`}
              >
                <div className="flex size-6 items-center justify-center rounded-full bg-[#DEE3E3] text-[10px] font-bold text-[#2A3030]">
                  {(m.user.name || "U")[0]}
                </div>
                {m.user.name || `User ${m.userId}`}
              </button>
            ))}
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-dashed border-[#E2E8F0] bg-white px-4 py-2 text-sm text-[#0B1C30] hover:bg-[#F8F9FF]"
            >
              <Plus className="size-4" />
              Multiple
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <p className="text-xs font-semibold tracking-wider text-[#6B7280]">SPLIT BY</p>
            <span className="rounded bg-[#FE6B00]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FE6B00]">MODE: EQUAL</span>
          </div>
          <div className="flex border-b border-[#E2E8F0]">
            {["Equal", "Exact", "%", "Shares", "Adj."].map((tab) => (
              <button
                key={tab}
                type="button"
                className={`flex-1 border-b-2 py-3 text-center text-sm font-medium transition ${
                  tab === "Equal"
                    ? "border-[#003535] text-[#003535]"
                    : "border-transparent text-[#6B7280] hover:text-[#0B1C30]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="space-y-1 p-2">
            {group.members.map((m) => {
              const isPayer = m.userId === selectedPayerId;
              const memberAmount =
                parseFloat(amount) && group.members.length > 0
                  ? (parseFloat(amount) / group.members.length).toFixed(2)
                  : "0.00";
              return (
                <div
                  key={m.userId}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                    isPayer ? "bg-[#F0F7FF]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-full bg-[#DEE3E3] text-xs font-bold text-[#2A3030]">
                      {(m.user.name || "U")[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#0B1C30]">
                        {m.user.name || `User ${m.userId}`}
                      </p>
                      {isPayer && <p className="text-[10px] text-[#FE6B00]">Payer</p>}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-[#6B7280]">${memberAmount}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#E2E8F0] bg-white py-4 text-sm text-[#6B7280] hover:bg-[#F8F9FF]"
          >
            <Camera className="size-4" />
            Attach Receipt
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#E2E8F0] bg-white py-4 text-sm text-[#6B7280] hover:bg-[#F8F9FF]"
          >
            <ImageIcon className="size-4" />
            Add Note
          </button>
        </div>
      </div>

      <div className="fixed bottom-24 left-1/2 mx-auto w-full max-w-[430px] -translate-x-1/2 px-4">
        <div className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#003535] px-5 py-4 shadow-lg">
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-white/70">SPLITTING SUMMARY</p>
            <p className="text-sm font-medium text-white">
              {group.members.length} people · $
              {parseFloat(amount) && group.members.length > 0
                ? (parseFloat(amount) / group.members.length).toFixed(2)
                : "0.00"}{" "}
              each
            </p>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">Balanced</span>
        </div>
      </div>

      {createExpenseMutation.isError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-red-500 px-4 py-2 text-sm text-white shadow-lg">
          Failed to create expense. Please try again.
        </div>
      )}
    </div>
  );
}
