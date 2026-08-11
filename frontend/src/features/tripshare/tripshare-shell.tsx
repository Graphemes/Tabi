"use client";

import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { LoginScreen } from "./auth/login-screen";
import { NavProvider } from "./navigation/nav-context";
import { AppShell } from "./app-shell";

export function TripShareShell() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUser = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  if (!hasHydrated) {
    // Matches the server-rendered output (auth state is unknown until the client reads
    // localStorage post-mount) so the first client paint doesn't diverge from the SSR-ed
    // HTML — see store/auth-store.ts.
    return (
      <div className="flex h-dvh items-center justify-center bg-surface">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!accessToken || !authUser) {
    return (
      <div className="flex h-dvh flex-col">
        <LoginScreen />
      </div>
    );
  }

  return (
    <NavProvider>
      <AppShell />
    </NavProvider>
  );
}
