"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { getGroups } from "@/features/whatsapp/api";
import { useNav } from "./navigation/nav-context";
import { SidebarNav } from "./navigation/sidebar-nav";
import { BottomNav } from "./navigation/bottom-nav";
import { PaneGroup, ListPane, DetailPane, FullPane } from "./layout/pane-group";
import { MyTrips } from "./my-trips";
import { ExpensesView } from "./expenses-view";
import { ExpenseDetail } from "./expense-detail";
import { MapView } from "./map-view";
import { ChatView } from "./chat-view";
import { OverlayHost } from "./overlays/overlay-host";

export function AppShell() {
  const authUser = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { nav, dispatch, pane } = useNav();

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    enabled: Boolean(accessToken),
    queryFn: getGroups,
  });

  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const chatGroup = useMemo(
    () => groups.find((g) => g.id === nav.selection.chat) ?? null,
    [groups, nav.selection.chat],
  );
  const expenseGroup = useMemo(
    () => groups.find((g) => g.id === nav.selection.expenses?.groupId) ?? null,
    [groups, nav.selection.expenses],
  );

  const openNewTrip = () => dispatch({ type: "OPEN_OVERLAY", overlay: { kind: "create-group" } });
  const openProfile = () => dispatch({ type: "OPEN_OVERLAY", overlay: { kind: "profile" } });
  const back = () => dispatch({ type: "BACK" });

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface">
      <SidebarNav
        tab={nav.tab}
        onSelectTab={(tab) => dispatch({ type: "SELECT_TAB", tab })}
        onNewTrip={openNewTrip}
        onOpenProfile={openProfile}
        user={authUser}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col">
          {nav.tab === "groups" && (
            <FullPane>
              <MyTrips
                groups={groups}
                isLoading={groupsQuery.isPending}
                selectedGroupId={null}
                onSelectGroup={(groupId) => dispatch({ type: "OPEN_TRIP_CHAT", groupId })}
                onNewTrip={openNewTrip}
                onOpenProfile={openProfile}
              />
            </FullPane>
          )}

          {nav.tab === "chat" && (
            <PaneGroup>
              <ListPane pane={pane}>
                <MyTrips
                  variant="compact"
                  groups={groups}
                  isLoading={groupsQuery.isPending}
                  selectedGroupId={nav.selection.chat}
                  onSelectGroup={(groupId) => dispatch({ type: "SELECT_CHAT", groupId })}
                  onNewTrip={openNewTrip}
                  onOpenProfile={openProfile}
                />
              </ListPane>
              <DetailPane pane={pane}>
                <ChatView
                  group={chatGroup}
                  onBack={back}
                  onAddExpense={(groupId) =>
                    dispatch({ type: "OPEN_OVERLAY", overlay: { kind: "add-expense", groupId } })
                  }
                />
              </DetailPane>
            </PaneGroup>
          )}

          {nav.tab === "expenses" && (
            <PaneGroup>
              <ListPane pane={pane}>
                <ExpensesView
                  groups={groups}
                  selected={nav.selection.expenses}
                  onSelectExpense={(ref) => dispatch({ type: "SELECT_EXPENSE", ref })}
                  onAddExpense={(groupId) =>
                    dispatch({ type: "OPEN_OVERLAY", overlay: { kind: "add-expense", groupId } })
                  }
                  onOpenProfile={openProfile}
                />
              </ListPane>
              <DetailPane pane={pane}>
                <ExpenseDetail
                  selected={nav.selection.expenses}
                  group={expenseGroup}
                  onBack={back}
                />
              </DetailPane>
            </PaneGroup>
          )}

          {nav.tab === "map" && (
            <FullPane>
              <MapView groups={groups} onOpenProfile={openProfile} />
            </FullPane>
          )}
        </main>

        <BottomNav tab={nav.tab} onSelectTab={(tab) => dispatch({ type: "SELECT_TAB", tab })} />
      </div>

      <OverlayHost groups={groups} />
    </div>
  );
}
