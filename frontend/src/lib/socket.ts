"use client";

import { io, type Socket } from "socket.io-client";
import { env } from "@/lib/env";

let socketInstance: Socket | null = null;

export const getSocket = (token?: string | null) => {
  if (socketInstance) {
    if (token) {
      socketInstance.auth = { token };
    }
    return socketInstance;
  }

  const fallbackToken =
    typeof window !== "undefined" ? window.localStorage.getItem("tabi.accessToken") : null;

  socketInstance = io(`${env.socketBaseUrl}/realtime`, {
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: false,
    auth: (token ?? fallbackToken) ? { token: token ?? fallbackToken } : undefined,
  });

  return socketInstance;
};

export const disconnectSocket = () => {
  if (!socketInstance) {
    return;
  }

  socketInstance.disconnect();
  socketInstance = null;
};
