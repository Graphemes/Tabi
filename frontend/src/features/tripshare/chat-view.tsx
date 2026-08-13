"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Send,
  Loader2,
  MessageCircle,
  Plus,
  X,
  ImagePlus,
  Receipt,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/app/user-avatar";
import { EmptyState } from "@/components/app/empty-state";
import { ScreenHeader } from "@/components/app/screen-header";
import { getMessages, uploadReceipt, ApiGroup, ApiMessage } from "@/features/whatsapp/api";
import { useAuthStore } from "@/store/auth-store";
import { env } from "@/lib/env";
import { getSocket } from "@/lib/socket";

function formatClock(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** A message is "grouped" with the previous one if same sender within 5 minutes. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

type PendingMessage = ApiMessage & { pending?: true };

type Props = {
  group: ApiGroup | null;
  onBack: () => void;
  onAddExpense?: (groupId: number) => void;
  onOpenExpense?: (groupId: number, expenseId: number) => void;
  /** Tapping the group name in the header opens the trip info sheet, WhatsApp-style. */
  onOpenInfo?: (groupId: number) => void;
};

export function ChatView({ group, onBack, onAddExpense, onOpenExpense, onOpenInfo }: Props) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUser = useAuthStore((s) => s.user);
  const [text, setText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const messagesQuery = useQuery({
    queryKey: ["groups", group?.id, "messages"],
    enabled: Boolean(accessToken && group?.id),
    queryFn: () => getMessages(Number(group!.id)),
  });

  const messages = useMemo(
    () => (messagesQuery.data ?? []) as PendingMessage[],
    [messagesQuery.data],
  );

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);
    const onMessage = (message: ApiMessage) => {
      queryClient.setQueryData<PendingMessage[]>(
        ["groups", message.groupId, "messages"],
        (current = []) => {
          if (current.some((m) => m.id === message.id)) return current;
          const withoutPending = current.filter(
            (m) =>
              !(
                m.pending &&
                m.senderId === message.senderId &&
                m.content === message.content
              ),
          );
          return [...withoutPending, message];
        },
      );
    };
    socket.on("message:new", onMessage);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [accessToken, queryClient]);

  // Auto-scroll to the newest message. This was missing entirely — the transcript stayed
  // pinned to the top, so new messages arrived off-screen. `auto` on group switch (jump
  // straight to the bottom), `smooth` for messages arriving in an open conversation.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    didInitialScroll.current = false;
  }, [group?.id]);

  useEffect(() => {
    if (!messages.length) return;
    const node = scrollRef.current;
    if (!node) return;

    if (!didInitialScroll.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
      didInitialScroll.current = true;
      return;
    }
    // Only follow along if the reader is already near the bottom, so scrolling back
    // through history isn't yanked away by an incoming message.
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom < 160) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  const handleSend = () => {
    const body = text.trim();
    if (!group || !body || !authUser) return;
    const socket = getSocket(accessToken);
    socket.emit("message:send", {
      groupId: group.id,
      message: { type: "TEXT", content: body },
    });

    // Optimistic echo so the bubble appears instantly instead of after the round trip.
    queryClient.setQueryData<PendingMessage[]>(
      ["groups", group.id, "messages"],
      (current = []) => [
        ...current,
        {
          id: -Date.now(),
          groupId: group.id,
          senderId: authUser.id,
          type: "TEXT",
          content: body,
          createdAt: new Date().toISOString(),
          sender: authUser,
          pending: true,
        },
      ],
    );

    setText("");
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    );
  };

  const handleImage = async (file: File) => {
    if (!group) return;
    setUploading(true);
    try {
      const { url } = await uploadReceipt(file);
      const socket = getSocket(accessToken);
      socket.emit("message:send", {
        groupId: group.id,
        message: { type: "IMAGE", mediaUrl: url, content: file.name },
      });
    } finally {
      setUploading(false);
    }
  };

  const shareLocation = () => {
    if (!group) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const socket = getSocket(accessToken);
        socket.emit("location:send-message", {
          groupId: group.id,
          payload: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        });
      },
      (err) => console.warn("Location error:", err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  if (!group) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          icon={MessageCircle}
          title="No conversation open"
          description="Pick a trip to jump into the group chat."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader
        title={
          onOpenInfo ? (
            <button
              type="button"
              onClick={() => onOpenInfo(group.id)}
              className="-mx-1 block max-w-full truncate rounded-lg px-1 text-left transition hover:opacity-70"
            >
              {group.name}
            </button>
          ) : (
            group.name
          )
        }
        subtitle={`${group.members.length} ${group.members.length === 1 ? "member" : "members"}`}
        onBack={onBack}
      />

      {/* `justify-end` keeps a short transcript pinned to the composer rather than
          floating at the top of a tall desktop pane. */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-4 py-4"
      >
        {messagesQuery.isPending ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No messages yet"
            description={`Say hello to the ${group.name} group.`}
          />
        ) : (
          <div className="space-y-0.5">
            {messages.map((msg, i) => {
              const mine = msg.senderId === authUser?.id;
              const prev = messages[i - 1];
              const newDay =
                !prev ||
                new Date(prev.createdAt).toDateString() !==
                  new Date(msg.createdAt).toDateString();
              const grouped =
                !newDay &&
                prev?.senderId === msg.senderId &&
                new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() <
                  GROUP_WINDOW_MS;
              const senderName =
                msg.sender?.name || msg.sender?.username || `User ${msg.senderId}`;

              return (
                <div key={msg.id}>
                  {newDay && (
                    <div className="flex items-center justify-center py-3">
                      <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {dayLabel(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  <div
                    className={cn(
                      "flex items-end gap-2",
                      mine ? "justify-end" : "justify-start",
                      grouped ? "mt-0.5" : "mt-2",
                    )}
                  >
                    {!mine &&
                      (grouped ? (
                        <span className="w-7 shrink-0" />
                      ) : (
                        <UserAvatar
                          name={senderName}
                          seed={msg.senderId}
                          size="xs"
                          className="mb-4"
                        />
                      ))}

                    <div className={cn("max-w-[78%] min-w-0", mine && "items-end")}>
                      {!mine && !grouped && (
                        <p className="mb-1 ml-1 text-[11px] font-medium text-muted-foreground">
                          {senderName}
                        </p>
                      )}

                      <div
                        className={cn(
                          "w-fit px-3 py-2 text-sm shadow-card",
                          mine
                            ? "ml-auto bg-brand-900 text-brand-50"
                            : "bg-surface-raised text-foreground ring-1 ring-border",
                          // Tighter corner on the side the tail would be, and only on the
                          // last bubble of a run.
                          mine
                            ? grouped
                              ? "rounded-2xl rounded-br-md"
                              : "rounded-2xl rounded-br-md"
                            : grouped
                              ? "rounded-2xl rounded-bl-md"
                              : "rounded-2xl rounded-bl-md",
                          msg.pending && "opacity-60",
                        )}
                      >
                        {msg.type === "LOCATION" ? (
                          <a
                            href={msg.content ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 underline underline-offset-2"
                          >
                            <MapPin className="size-4" />
                            Shared a location
                          </a>
                        ) : msg.type === "IMAGE" && msg.mediaUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- user upload
                          <img
                            src={`${env.apiBaseUrl}${msg.mediaUrl}`}
                            alt={msg.content ?? "Shared image"}
                            className="max-h-64 rounded-lg object-cover"
                          />
                        ) : msg.expense ? (
                          <button
                            type="button"
                            onClick={() => onOpenExpense?.(msg.groupId, msg.expense!.id)}
                            className="text-left"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Receipt className="size-4 shrink-0" />
                              <span className="font-semibold text-sm">
                                {msg.expense.title}
                              </span>
                            </div>
                            <p className="text-xs opacity-80">
                              {msg.sender?.name || msg.sender?.username || msg.sender?.phone || "Someone"} paid{" "}
                              <span className="font-medium">
                                {Number(msg.expense.totalAmount).toLocaleString(undefined, {
                                  style: "currency",
                                  currency: msg.expense.currency,
                                })}
                              </span>
                            </p>
                            <span className="inline-block mt-1 text-xs underline underline-offset-2 opacity-70">
                              View expense →
                            </span>
                          </button>
                        ) : (
                          <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>

                      <div
                        className={cn(
                          "mt-0.5 flex items-center gap-1 px-1",
                          mine ? "justify-end" : "justify-start",
                        )}
                      >
                        <span className="tabular text-[10px] text-muted-foreground">
                          {formatClock(msg.createdAt)}
                        </span>
                        {mine &&
                          (msg.pending ? (
                            <Loader2 className="size-2.5 animate-spin text-muted-foreground" />
                          ) : (
                            <Check className="size-3 text-muted-foreground" />
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div ref={menuRef} className="relative shrink-0">
        {showMenu && (
          <div className="absolute bottom-full left-3 mb-2 w-52 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-overlay">
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                fileInputRef.current?.click();
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-surface-hover"
            >
              <ImagePlus className="size-4.5 text-muted-foreground" />
              Photo
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                shareLocation();
              }}
              className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-sm transition hover:bg-surface-hover"
            >
              <MapPin className="size-4.5 text-muted-foreground" />
              Location
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                onAddExpense?.(group.id);
              }}
              className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-sm transition hover:bg-surface-hover"
            >
              <Receipt className="size-4.5 text-muted-foreground" />
              Expense
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleImage(file);
          }}
        />

        <footer className="flex items-end gap-2 border-t border-border bg-surface-raised p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Attach"
            disabled={uploading}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : showMenu ? (
              <X className="size-5" />
            ) : (
              <Plus className="size-5" />
            )}
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm transition placeholder:text-muted-foreground focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim()}
            aria-label="Send"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-white transition hover:bg-accent-600 disabled:opacity-40"
          >
            <Send className="size-4.5" />
          </button>
        </footer>
      </div>
    </div>
  );
}
