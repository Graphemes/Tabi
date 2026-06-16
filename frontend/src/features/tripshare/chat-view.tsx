"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Send, Loader2, MessageCircle } from "lucide-react";
import { getMessages, ApiGroup, ApiMessage } from "@/features/whatsapp/api";
import { useAuthStore } from "@/store/auth-store";
import { getSocket } from "@/lib/socket";

function formatClock(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type Props = {
  group: ApiGroup | null;
  onBack: () => void;
};

export function ChatView({ group, onBack }: Props) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUser = useAuthStore((s) => s.user);
  const [text, setText] = useState("");

  const messagesQuery = useQuery({
    queryKey: ["groups", group?.id, "messages"],
    enabled: Boolean(accessToken && group?.id),
    queryFn: () => getMessages(Number(group!.id)),
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);
    const onMessage = (message: ApiMessage) => {
      queryClient.setQueryData<ApiMessage[]>(
        ["groups", message.groupId, "messages"],
        (current = []) => {
          if (current.some((m) => m.id === message.id)) return current;
          return [...current, message];
        },
      );
    };
    socket.on("message:new", onMessage);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [accessToken, queryClient]);

  const handleSend = async () => {
    if (!group || !text.trim()) return;
    const socket = getSocket(accessToken);
    socket.emit("message:send", {
      groupId: group.id,
      message: { type: "TEXT", content: text.trim() },
    });
    setText("");
  };

  if (!group) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="size-16 rounded-2xl bg-[#DCE9FF] flex items-center justify-center">
          <MessageCircle className="size-7 text-[#003535]" />
        </div>
        <h3 className="text-lg font-semibold text-[#0B1C30]">Select a trip</h3>
        <p className="max-w-xs text-sm text-[#6B7280]">
          Choose a trip from the Groups tab to start chatting
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-full p-1 hover:bg-[#DCE9FF]">
          <ArrowLeft className="size-5 text-[#404848]" />
        </button>
        <div className="flex size-10 items-center justify-center rounded-full bg-[#DEE3E3] text-sm font-bold text-[#2A3030]">
          {group.name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#0B1C30]">{group.name}</p>
          <p className="text-xs text-[#6B7280]">{group.members.length} members</p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,#f5fffb_0%,#f9fcff_100%)] p-4">
        {messagesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-[#6B7280]" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6B7280]">No messages yet</p>
        ) : (
          messages.map((msg) => {
            const mine = msg.senderId === authUser?.id;
            return (
              <div
                key={msg.id}
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  mine ? "ml-auto bg-[#003535] text-white" : "bg-white text-[#0B1C30]"
                }`}
              >
                {msg.type === "LOCATION" ? (
                  <a
                    href={msg.content ?? ""}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 underline"
                  >
                    <MapPin className="size-4" />
                    Shared location
                  </a>
                ) : (
                  <p>{msg.content}</p>
                )}
                <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-[#6B7280]"}`}>
                  {formatClock(msg.createdAt)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <footer className="flex items-end gap-2 border-t border-[#E2E8F0] bg-white p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Type a message..."
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-[#E2E8F0] bg-[#F8F9FF] px-4 py-2.5 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#003535] text-white disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </footer>
    </div>
  );
}
