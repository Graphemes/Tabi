"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/app/user-avatar";
import { useAuthStore } from "@/store/auth-store";

/**
 * Per-screen header. The app wordmark lives in the desktop sidebar, so on mobile each
 * screen carries its own title bar; the profile avatar is mobile-only for the same reason.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  onOpenProfile,
  actions,
  sticky = true,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Shown on mobile only — desktop keeps both panes visible so there's nothing to go back to. */
  onBack?: () => void;
  onOpenProfile?: () => void;
  actions?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  const authUser = useAuthStore((s) => s.user);
  const displayName =
    authUser?.name || authUser?.username || authUser?.email || authUser?.phone || "Account";

  return (
    <header
      className={cn(
        "flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface-raised/80 px-4 backdrop-blur",
        sticky && "sticky top-0 z-10",
        className,
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-1 rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-hover hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-lg leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {actions}

      {onOpenProfile && (
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Open profile"
          className="rounded-full transition hover:opacity-80 md:hidden"
        >
          <UserAvatar name={displayName} seed={authUser?.id} size="sm" />
        </button>
      )}
    </header>
  );
}
