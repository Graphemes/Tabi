"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { getSocket } from "@/lib/socket";
import { getGroups, type ApiMessage, type ApiGroup } from "@/features/whatsapp/api";
import { useNav } from "./navigation/nav-context";
import { SidebarNav } from "./navigation/sidebar-nav";
import { BottomNav } from "./navigation/bottom-nav";
import { PaneGroup, ListPane, DetailPane, FullPane } from "./layout/pane-group";
import { MyTrips } from "./my-trips";
import { ExpensesView } from "./expenses-view";
import { ExpenseDetail } from "./expense-detail";
import { MapView } from "./map-view";
import { MapDetail } from "./map/map-detail";
import { ChatView } from "./chat-view";
import { OverlayHost } from "./overlays/overlay-host";

export function AppShell() {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { nav, dispatch, pane } = useNav();

  // pony tail: socket message:new listener always mounted so groups list lastMessage
  // stays fresh regardless of which tab is active.
  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);
    const onMessage = (msg: ApiMessage) => {
      queryClient.setQueryData<ApiGroup[]>(["groups"], (current = []) =>
        current.map((g) =>
          g.id === msg.groupId
            ? { ...g, lastMessage: msg, updatedAt: msg.createdAt }
            : g,
        ),
      );
    };
    socket.on("message:new", onMessage);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [accessToken, queryClient]);

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
  const mapGroup = useMemo(
    () => groups.find((g) => g.id === nav.selection.map) ?? null,
    [groups, nav.selection.map],
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
                  onOpenExpense={(groupId, expenseId) => {
                    dispatch({ type: "SELECT_TAB", tab: "expenses" });
                    dispatch({ type: "SELECT_EXPENSE", ref: { groupId, expenseId } });
                  }}
                  onOpenInfo={(groupId) =>
                    dispatch({ type: "OPEN_OVERLAY", overlay: { kind: "group-info", groupId } })
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
            <PaneGroup>
              <ListPane pane={pane}>
                <MapView
                  groups={groups}
                  selectedGroupId={nav.selection.map}
                  onSelectTrip={(groupId) => dispatch({ type: "SELECT_MAP_TRIP", groupId })}
                  onOpenProfile={openProfile}
                />
              </ListPane>
              <DetailPane pane={pane}>
                <MapDetail
                  // Remount per trip so the draft pin, selection and map instance are
                  // rebuilt for the new trip rather than reset in an effect.
                  key={mapGroup?.id ?? "none"}
                  group={mapGroup}
                  onBack={back}
                  onSavePlace={(groupId, draft) =>
                    dispatch({ type: "OPEN_OVERLAY", overlay: { kind: "save-place", groupId, draft } })
                  }
                  onOpenChat={(groupId) => dispatch({ type: "OPEN_TRIP_CHAT", groupId })}
                />
              </DetailPane>
            </PaneGroup>
          )}
        </main>

        <BottomNav tab={nav.tab} onSelectTab={(tab) => dispatch({ type: "SELECT_TAB", tab })} />
      </div>

      <OverlayHost groups={groups} />
    </div>
  );
}
