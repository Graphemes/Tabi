"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ApiGroup } from "@/features/whatsapp/api";

export type ItemDraft = {
  id: string;
  name: string;
  amount: string;
  quantity: string;
  participantUserIds: number[];
};

export function newItemDraft(allMemberIds: number[]): ItemDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    amount: "",
    quantity: "1",
    participantUserIds: [...allMemberIds],
  };
}

export function itemsTotal(items: ItemDraft[]): number {
  return items.reduce((sum, item) => {
    const amount = parseFloat(item.amount) || 0;
    const quantity = parseInt(item.quantity, 10) || 1;
    return sum + amount * quantity;
  }, 0);
}

type Props = {
  group: ApiGroup;
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
};

export function ItemizedSplit({ group, items, onChange }: Props) {
  const members = group.members;

  const updateItem = (id: string, patch: Partial<ItemDraft>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const addItem = () => {
    onChange([...items, newItemDraft(members.map((m) => m.userId))]);
  };

  const toggleParticipant = (item: ItemDraft, userId: number) => {
    const has = item.participantUserIds.includes(userId);
    updateItem(item.id, {
      participantUserIds: has
        ? item.participantUserIds.filter((id) => id !== userId)
        : [...item.participantUserIds, userId],
    });
  };

  return (
    <div className="space-y-2 p-3">
      {items.length === 0 && (
        <p className="px-1 py-2 text-sm text-[#6B7280]">
          Add items and pick who shares each one.
        </p>
      )}
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-[#E2E8F0] p-3">
          <div className="flex items-center gap-2">
            <input
              value={item.name}
              onChange={(e) => updateItem(item.id, { name: e.target.value })}
              placeholder="Item name"
              className="flex-1 rounded border border-[#E2E8F0] px-2 py-1.5 text-sm text-[#0B1C30] focus:outline-none focus:ring-1 focus:ring-[#FE6B00]/30"
            />
            <span className="text-sm text-[#6B7280]">$</span>
            <input
              value={item.amount}
              onChange={(e) =>
                updateItem(item.id, { amount: e.target.value.replace(/[^0-9.]/g, "") })
              }
              placeholder="0.00"
              className="w-20 rounded border border-[#E2E8F0] px-2 py-1.5 text-right text-sm text-[#0B1C30] focus:outline-none focus:ring-1 focus:ring-[#FE6B00]/30"
            />
            <span className="text-sm text-[#6B7280]">x</span>
            <input
              value={item.quantity}
              onChange={(e) =>
                updateItem(item.id, { quantity: e.target.value.replace(/[^0-9]/g, "") })
              }
              placeholder="1"
              className="w-12 rounded border border-[#E2E8F0] px-2 py-1.5 text-right text-sm text-[#0B1C30] focus:outline-none focus:ring-1 focus:ring-[#FE6B00]/30"
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="rounded-full p-1.5 text-red-500 hover:bg-red-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {members.map((m) => {
              const active = item.participantUserIds.includes(m.userId);
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => toggleParticipant(item, m.userId)}
                  className={
                    "rounded-full border px-2.5 py-1 text-xs transition " +
                    (active
                      ? "border-[#003535] bg-[#003535] text-white"
                      : "border-[#E2E8F0] bg-white text-[#6B7280]")
                  }
                >
                  {m.user.name || `User ${m.userId}`}
                </button>
              );
            })}
          </div>
          {item.participantUserIds.length === 0 && (
            <p className="mt-1.5 text-xs text-red-500">Pick at least one person for this item</p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E2E8F0] py-2.5 text-sm text-[#6B7280] hover:bg-[#F8F9FF]"
      >
        <Plus className="size-4" />
        Add item
      </button>
    </div>
  );
}
