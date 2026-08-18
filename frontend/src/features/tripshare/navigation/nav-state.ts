import type { TabId } from "../types";

export type ExpenseRef = { groupId: number; expenseId: number };

/** A pin that isn't saved yet — from a search hit, or dropped by hand on the map. */
export type PlaceDraft = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  externalId?: string;
};

export type Overlay =
  | { kind: "create-group" }
  | { kind: "profile" }
  // Carries its own groupId rather than reading `selection` — otherwise opening
  // "add expense" from the Expenses tab would silently repoint the open chat.
  | { kind: "add-expense"; groupId: number }
  // Same reasoning: the draft travels with the overlay so closing and reopening
  // the map tab can't hand the form a stale pin.
  | { kind: "save-place"; groupId: number; draft: PlaceDraft }
  | { kind: "group-info"; groupId: number };

export type NavState = {
  tab: TabId;
  /** Mobile-only push depth, tracked per tab. Desktop CSS ignores it. */
  pane: Record<TabId, "list" | "detail">;
  /** Per-tab selection — never cleared by a tab switch, so desktop keeps both panes. */
  selection: {
    /** Trips tab: the trip whose chat is open in the detail pane. */
    groups: number | null;
    expenses: ExpenseRef | null;
    map: number | null;
  };
  overlay: Overlay | null;
};

export const initialNavState: NavState = {
  tab: "groups",
  pane: { groups: "list", expenses: "list", map: "list" },
  selection: { groups: null, expenses: null, map: null },
  overlay: null,
};

export type NavAction =
  | { type: "SELECT_TAB"; tab: TabId }
  /** Open a trip's chat in the Trips tab detail pane. */
  | { type: "OPEN_TRIP_CHAT"; groupId: number }
  | { type: "SELECT_EXPENSE"; ref: ExpenseRef }
  /** Pick which trip's map to show, from the Map tab's own list pane. */
  | { type: "SELECT_MAP_TRIP"; groupId: number }
  | { type: "BACK" }
  | { type: "OPEN_OVERLAY"; overlay: Overlay }
  | { type: "CLOSE_OVERLAY" };

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "SELECT_TAB":
      return { ...state, tab: action.tab };

    case "OPEN_TRIP_CHAT":
      return {
        ...state,
        tab: "groups",
        selection: { ...state.selection, groups: action.groupId },
        pane: { ...state.pane, groups: "detail" },
      };

    case "SELECT_EXPENSE":
      return {
        ...state,
        selection: { ...state.selection, expenses: action.ref },
        pane: { ...state.pane, expenses: "detail" },
      };

    case "SELECT_MAP_TRIP":
      return {
        ...state,
        selection: { ...state.selection, map: action.groupId },
        pane: { ...state.pane, map: "detail" },
      };

    case "BACK":
      return { ...state, pane: { ...state.pane, [state.tab]: "list" } };

    case "OPEN_OVERLAY":
      return { ...state, overlay: action.overlay };

    case "CLOSE_OVERLAY":
      return { ...state, overlay: null };

    default:
      return state;
  }
}

/**
 * Which pane the *mobile* layout shows. Never trust `pane` alone — a tab whose selection
 * is empty must fall back to the list, or you get a blank detail pane.
 */
export function visiblePane(state: NavState): "list" | "detail" {
  return state.selection[state.tab] == null ? "list" : state.pane[state.tab];
}
