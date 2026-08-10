"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LayoutGrid, Wallet, Map, MessageCircle, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth-store";
import { getGroups, requestOtp, verifyOtp } from "@/features/whatsapp/api";
import type { TabId } from "./types";
import { MyTrips } from "./my-trips";
import { ExpensesView } from "./expenses-view";
import { MapView } from "./map-view";
import { ChatView } from "./chat-view";
import { CreateNewGroup } from "./create-new-group";
import { ProfilePage } from "./profile-page";
import { AddExpense } from "./add-expense";

const TABS: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "groups", label: "Groups", icon: LayoutGrid },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "map", label: "Map", icon: Map },
  { id: "chat", label: "Chat", icon: MessageCircle },
];

const loginSchema = z.object({
  mobile: z
    .string()
    .min(10, "Enter valid mobile number")
    .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

type LoginSchema = z.infer<typeof loginSchema>;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TripShareShell() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUser = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  const [activeTab, setActiveTab] = useState<TabId>("groups");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<"create-group" | "profile" | "add-expense" | null>(null);
  const [loginStep, setLoginStep] = useState<"phone" | "otp">("phone");
  const [pendingPhone, setPendingPhone] = useState("");
  const [otpValue, setOtpValue] = useState("");

  const loginForm = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mobile: "" },
  });

  const requestOtpMutation = useMutation({
    mutationFn: (phone: string) => requestOtp(phone),
    onSuccess: () => setLoginStep("otp"),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: verifyOtp,
    onSuccess: (data) => {
      setAuth({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: { ...data.user, phone: data.phone, name: data.user.name || "User" },
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    enabled: Boolean(accessToken),
    queryFn: getGroups,
  });

  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  if (!hasHydrated) {
    // Matches the server-rendered output (auth state is unknown until the
    // client reads localStorage post-mount) so the first client paint
    // doesn't diverge from the SSR-ed HTML — see store/auth-store.ts.
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FF]">
        <Loader2 className="size-6 animate-spin text-[#6B7280]" />
      </div>
    );
  }

  if (!accessToken || !authUser) {
    if (loginStep === "otp") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F8F9FF] p-4">
          <Card className="w-full max-w-md border-0 shadow-xl">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep("phone");
                    setOtpValue("");
                    requestOtpMutation.reset();
                  }}
                  className="-ml-1 rounded-full p-1 text-[#6B7280] hover:bg-[#DCE9FF]"
                >
                  <ArrowLeft className="size-5" />
                </button>
                <CardTitle className="text-xl text-[#003535]">Enter OTP</CardTitle>
              </div>
              <p className="text-sm text-[#6B7280]">
                OTP sent to <span className="font-medium text-[#0B1C30]">{pendingPhone}</span>
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#0B1C30]">6-digit OTP</label>
                  <Input
                    placeholder="000000"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    className="text-center text-2xl tracking-[0.5em]"
                    autoFocus
                  />
                </div>
                {verifyOtpMutation.isError && (
                  <p className="text-sm text-red-500">
                    {verifyOtpMutation.error?.message || "Invalid or expired OTP"}
                  </p>
                )}
                <Button
                  className="w-full bg-[#003535] text-white hover:bg-[#002828]"
                  disabled={otpValue.length < 4 || verifyOtpMutation.isPending}
                  onClick={() => verifyOtpMutation.mutate({ phone: pendingPhone, otp: otpValue })}
                >
                  {verifyOtpMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Verify OTP
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FF] p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-[#003535]">Welcome to TripShare</CardTitle>
            <p className="text-sm text-[#6B7280]">
              Enter your details to receive a one-time password.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={loginForm.handleSubmit((values) => {
                const fullPhone = `+91${values.mobile}`;
                setPendingPhone(fullPhone);
                requestOtpMutation.mutate(fullPhone);
              })}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#0B1C30]">Mobile Number</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[#0B1C30]">
                    +91
                  </span>
                  <Input
                    placeholder="98XXXXXXXX"
                    className="pl-14"
                    value={loginForm.watch("mobile")}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      loginForm.setValue("mobile", val, { shouldValidate: true });
                    }}
                  />
                </div>
                {loginForm.formState.errors.mobile && (
                  <p className="text-xs text-red-500">
                    {loginForm.formState.errors.mobile.message}
                  </p>
                )}
              </div>
              {requestOtpMutation.isError && (
                <p className="text-sm text-red-500">
                  {requestOtpMutation.error?.message || "Could not send OTP"}
                </p>
              )}
              <Button
                type="submit"
                className="w-full bg-[#003535] text-white hover:bg-[#002828]"
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Send OTP
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-[#F8F9FF]">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-xl font-bold text-[#003535]">TripShare</h1>
        <div className="flex items-center gap-4">
          <button type="button" className="relative">
            <Bell className="size-5 text-[#404848]" />
          </button>
          <button
            type="button"
            onClick={() => setActiveOverlay("profile")}
            className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-[#BFC8C8] bg-[#D3E4FE]"
          >
            <span className="text-sm font-semibold text-[#0B1C30]">
              {initials(
                authUser.name || authUser.username || authUser.email || authUser.phone || "U",
              )}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden">
        {activeOverlay === "create-group" ? (
          <CreateNewGroup onBack={() => setActiveOverlay(null)} />
        ) : activeOverlay === "add-expense" && selectedGroup ? (
          <AddExpense group={selectedGroup} onBack={() => setActiveOverlay(null)} />
        ) : activeOverlay === "profile" ? (
          <ProfilePage onBack={() => setActiveOverlay(null)} />
        ) : activeTab === "chat" && selectedGroup ? (
          <ChatView
            group={selectedGroup}
            onBack={() => {
              setSelectedGroupId(null);
              setActiveTab("groups");
            }}
            onAddExpense={() => setActiveOverlay("add-expense")}
          />
        ) : activeTab === "chat" ? (
          <ChatView group={null} onBack={() => {}} />
        ) : activeTab === "groups" ? (
          <MyTrips
            groups={groups}
            onSelectGroup={(id) => {
              setSelectedGroupId(id);
              setActiveTab("chat");
            }}
            onFabClick={() => setActiveOverlay("create-group")}
          />
        ) : activeTab === "expenses" ? (
          <ExpensesView
            groups={groups}
            onSelectGroup={(id) => { setSelectedGroupId(id); setActiveTab("chat"); }}
            onAddExpense={(id) => { setSelectedGroupId(id); setActiveOverlay("add-expense"); }}
          />
        ) : (
          <MapView />
        )}
      </div>

      <footer className="flex items-center justify-around border-t border-[#E2E8F0] bg-[#F8F9FF] px-6 py-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== "chat") setSelectedGroupId(null);
              }}
              className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 transition ${
                isActive ? "bg-[#FE6B00] text-white" : "text-[#404848] hover:bg-[#DCE9FF]"
              }`}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-semibold tracking-[0.05em]">{tab.label}</span>
            </button>
          );
        })}
      </footer>
    </div>
  );
}
