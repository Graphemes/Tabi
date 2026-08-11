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
        <p className="px-1 py-2 text-sm text-muted-foreground">
          Add items and pick who shares each one.
        </p>
      )}
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <input
              value={item.name}
              onChange={(e) => updateItem(item.id, { name: e.target.value })}
              placeholder="Item name"
              className="flex-1 rounded border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20"
            />
            <span className="text-sm text-muted-foreground">$</span>
            <input
              value={item.amount}
              onChange={(e) =>
                updateItem(item.id, { amount: e.target.value.replace(/[^0-9.]/g, "") })
              }
              placeholder="0.00"
              className="w-20 rounded border border-border px-2 py-1.5 text-right text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20"
            />
            <span className="text-sm text-muted-foreground">x</span>
            <input
              value={item.quantity}
              onChange={(e) =>
                updateItem(item.id, { quantity: e.target.value.replace(/[^0-9]/g, "") })
              }
              placeholder="1"
              className="w-12 rounded border border-border px-2 py-1.5 text-right text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-500/20"
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="rounded-full p-1.5 text-destructive hover:bg-negative-soft"
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
                      ? "border-brand-900 bg-brand-900 text-white"
                      : "border-border bg-surface-raised text-muted-foreground")
                  }
                >
                  {m.user.name || `User ${m.userId}`}
                </button>
              );
            })}
          </div>
          {item.participantUserIds.length === 0 && (
            <p className="mt-1.5 text-xs text-destructive">Pick at least one person for this item</p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-2.5 text-sm text-muted-foreground hover:bg-surface"
      >
        <Plus className="size-4" />
        Add item
      </button>
    </div>
  );
}
