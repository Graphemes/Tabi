"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 -m-3 rounded-full bg-brand-100/60 blur-xl dark:bg-brand-100/25"
        />
        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 ring-1 ring-brand-200/60">
          <Icon className="size-6" />
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mx-auto max-w-[28ch] text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
