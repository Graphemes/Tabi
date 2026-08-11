import { LayoutGrid, Wallet, Map, MessageCircle, type LucideIcon } from "lucide-react";
import type { TabId } from "../types";

export const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "groups", label: "Trips", icon: LayoutGrid },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "map", label: "Map", icon: Map },
  { id: "chat", label: "Chat", icon: MessageCircle },
];

export const TAB_TITLES: Record<TabId, string> = {
  groups: "Trips",
  expenses: "Expenses",
  map: "Map",
  chat: "Chat",
};
