"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

/**
 * One overlay that is a full-screen sheet on mobile and a centred dialog from `lg` up,
 * shaped purely by CSS.
 *
 * Deliberately not a media-query swap between two primitives: resizing would remount the
 * child, and AddExpense holds ~15 fields of in-progress form state (including an already
 * uploaded receipt) that must survive a rotate.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required for a11y — rendered visually hidden; screens keep their own headings. */
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px]",
            "duration-150 data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            // mobile + tablet: full-screen takeover, matching the previous behaviour
            "fixed inset-0 z-50 flex flex-col bg-surface outline-none",
            "duration-150 data-open:animate-in data-open:slide-in-from-bottom-4 data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
            // desktop: centred dialog
            "lg:inset-auto lg:top-1/2 lg:left-1/2 lg:h-auto lg:max-h-[85dvh] lg:w-[min(34rem,92vw)]",
            "lg:-translate-x-1/2 lg:-translate-y-1/2 lg:overflow-hidden lg:rounded-2xl",
            "lg:shadow-overlay lg:ring-1 lg:ring-border lg:data-open:zoom-in-95",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
