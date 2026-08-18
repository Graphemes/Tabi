export type Trip = {
  id: number;
  name: string;
  lastActivity: string;
  lastMessage: string | null;
  avatarUrl?: string;
  expenseStatus: "owed" | "you-owe" | "settled" | "pending-invite";
  expenseAmount: number;
  memberCount: number;
  activeCount: number;
};

export type FilterChip = "All Trips" | "Active" | "Pending" | "Archived";

/** The Trips tab owns the chat: selecting a trip opens its conversation in the detail pane. */
export type TabId = "groups" | "expenses" | "map";
