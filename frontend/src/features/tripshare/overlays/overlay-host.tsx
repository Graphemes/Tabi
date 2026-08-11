"use client";

import { ResponsiveModal } from "@/components/ui/responsive-modal";
import type { ApiGroup } from "@/features/whatsapp/api";
import { useNav } from "../navigation/nav-context";
import { CreateNewGroup } from "../create-new-group";
import { ProfilePage } from "../profile-page";
import { AddExpense } from "../add-expense";

const TITLES = {
  "create-group": "New trip",
  profile: "Your profile",
  "add-expense": "Add expense",
} as const;

export function OverlayHost({ groups }: { groups: ApiGroup[] }) {
  const { nav, dispatch } = useNav();
  const overlay = nav.overlay;
  const close = () => dispatch({ type: "CLOSE_OVERLAY" });

  const addExpenseGroup =
    overlay?.kind === "add-expense"
      ? (groups.find((g) => g.id === overlay.groupId) ?? null)
      : null;

  return (
    <ResponsiveModal
      open={overlay !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={overlay ? TITLES[overlay.kind] : ""}
    >
      {overlay?.kind === "create-group" && <CreateNewGroup onBack={close} />}
      {overlay?.kind === "profile" && <ProfilePage onBack={close} />}
      {overlay?.kind === "add-expense" && addExpenseGroup && (
        <AddExpense group={addExpenseGroup} onBack={close} />
      )}
    </ResponsiveModal>
  );
}
