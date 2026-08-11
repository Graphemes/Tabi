"use client";

import { createContext, useContext, useMemo, useReducer } from "react";
import {
  initialNavState,
  navReducer,
  visiblePane,
  type NavAction,
  type NavState,
} from "./nav-state";

type NavContextValue = {
  nav: NavState;
  dispatch: React.Dispatch<NavAction>;
  /** Which pane mobile shows for the active tab. */
  pane: "list" | "detail";
};

const NavContext = createContext<NavContextValue | null>(null);

/**
 * Navigation state lives in a per-tree reducer rather than a Zustand singleton so it dies
 * with the auth gate — no manual clearing on logout.
 */
export function NavProvider({ children }: { children: React.ReactNode }) {
  const [nav, dispatch] = useReducer(navReducer, initialNavState);
  const value = useMemo(
    () => ({ nav, dispatch, pane: visiblePane(nav) }),
    [nav],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used inside <NavProvider>");
  return ctx;
}
