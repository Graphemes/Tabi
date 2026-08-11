"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Loader2, LogOut, Trash2, Monitor, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/app/user-avatar";
import { useAuthStore } from "@/store/auth-store";
import { getProfile, updateProfile, deleteAccount, logout } from "@/features/whatsapp/api";

type Props = { onBack: () => void };

type ProfileForm = { name: string; username: string; email: string; phone: string };

const FIELDS: { key: keyof ProfileForm; label: string; placeholder: string; type?: string }[] = [
  { key: "name", label: "Full name", placeholder: "Your full name" },
  { key: "username", label: "Username", placeholder: "username" },
  { key: "email", label: "Email", placeholder: "you@example.com", type: "email" },
  { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
];

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

// `false` on the server, `true` once hydrated — without the effect-plus-setState dance
// that the react-hooks lint (rightly) flags as a cascading render.
const noopSubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

export function ProfilePage({ onBack }: Props) {
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const authUser = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { theme, setTheme } = useTheme();
  // next-themes only knows the active theme after hydration; rendering `theme` on the
  // server would mismatch the SSR-ed markup.
  const mounted = useMounted();

  const [form, setForm] = useState<ProfileForm>({
    name: "",
    username: "",
    email: "",
    phone: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", authUser?.id],
    queryFn: getProfile,
    enabled: Boolean(authUser?.id),
  });

  // Seed the editable form when server data arrives, adjusting state during render
  // rather than in an effect — the pattern React documents for "derive from props".
  const [seededFrom, setSeededFrom] = useState(profileQuery.data);
  if (profileQuery.data && profileQuery.data !== seededFrom) {
    setSeededFrom(profileQuery.data);
    setForm({
      name: profileQuery.data.name || "",
      username: profileQuery.data.username || "",
      email: profileQuery.data.email || "",
      phone: profileQuery.data.phone || "",
    });
  }

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      if (authUser) {
        setAuth({
          accessToken: useAuthStore.getState().accessToken!,
          refreshToken: useAuthStore.getState().refreshToken!,
          user: {
            ...authUser,
            name: data.name || authUser.name || null,
            username: data.username || null,
            email: data.email || null,
            phone: data.phone || authUser.phone,
          },
        });
      }
    },
  });

  const logoutMutation = useMutation({ mutationFn: logout, onSuccess: clearAuth });
  const deleteAccountMutation = useMutation({ mutationFn: deleteAccount, onSuccess: clearAuth });

  const hasChanges =
    form.name !== (profileQuery.data?.name || "") ||
    form.username !== (profileQuery.data?.username || "") ||
    form.email !== (profileQuery.data?.email || "") ||
    form.phone !== (profileQuery.data?.phone || "");

  const displayName =
    form.name || profileQuery.data?.username || profileQuery.data?.phone || "User";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="flex-1 font-heading text-lg font-semibold tracking-tight">Profile</h1>
        <button
          type="button"
          onClick={onBack}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 p-5">
          <div className="flex flex-col items-center gap-2">
            <UserAvatar name={displayName} seed={authUser?.id} size="xl" />
            <div className="text-center">
              <h2 className="font-heading text-lg font-semibold">{displayName}</h2>
              {profileQuery.data?.username && (
                <p className="text-sm text-muted-foreground">@{profileQuery.data.username}</p>
              )}
            </div>
          </div>

          <section className="space-y-3">
            {FIELDS.map(({ key, label, placeholder, type }) => (
              <div key={key} className="space-y-1.5">
                <label htmlFor={key} className="text-xs font-medium text-muted-foreground">
                  {label}
                </label>
                <input
                  id={key}
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-11 w-full rounded-xl border border-border bg-surface-raised px-3.5 text-sm transition placeholder:text-muted-foreground focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                />
              </div>
            ))}

            {updateMutation.isError && (
              <p className="text-sm text-destructive">Could not save changes.</p>
            )}
            {updateMutation.isSuccess && !hasChanges && (
              <p className="text-sm text-positive">Profile updated.</p>
            )}

            <Button
              size="lg"
              className="h-11 w-full"
              disabled={!hasChanges || updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  name: form.name.trim() || undefined,
                  username: form.username.trim() || undefined,
                  email: form.email.trim() || undefined,
                  phone: form.phone.trim() || undefined,
                })
              }
            >
              {updateMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Appearance</h3>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface-raised p-1.5">
              {THEMES.map(({ value, label, icon: Icon }) => {
                const active = mounted && theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition",
                      active
                        ? "bg-brand-100 text-brand-800"
                        : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2 border-t border-border pt-5">
            <Button
              variant="outline"
              size="lg"
              className="h-11 w-full"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Log out
            </Button>

            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-destructive transition hover:bg-negative-soft"
              >
                <Trash2 className="size-4" />
                Delete account
              </button>
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-negative-soft p-4">
                <p className="text-sm font-semibold text-destructive">Delete this account?</p>
                <p className="mt-1 text-xs text-destructive/80">
                  Your trips, expenses and messages go with it. This can&apos;t be undone.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    className="h-10 flex-1"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-10 flex-1"
                    disabled={deleteAccountMutation.isPending}
                    onClick={() => deleteAccountMutation.mutate()}
                  >
                    {deleteAccountMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Delete"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
